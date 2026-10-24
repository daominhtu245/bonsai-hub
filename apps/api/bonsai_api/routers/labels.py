"""/admin/labels — gán nhãn bộ dữ liệu YOLO-seg 3 lớp ngay trong app (thay CVAT).

Ảnh vào từ 2 nguồn: admin tải lên, hoặc ảnh mặt tiền của phiên A đã chạy (chỉ người dùng đồng ý cho dùng ảnh
huấn luyện, hoặc cây của chính admin). Worker tạo mask nháp (bonsai_worker/tasks/labeling.py); người duyệt sửa
bằng cọ/tẩy, đánh dấu đúng/sai từng đối tượng. Xuất để huấn luyện: packages/pipeline/tools/seg/export_labels.py.
"""

import re
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from bonsai_pipeline.labeling import mask_png, read_mask

from .. import storage
from ..db.models import DesignJob, SegLabel, SegLabelStatus, User, UserRole
from ..queue import enqueue
from ..security import DB, require_admin
from .uploads import upload_prefix

router = APIRouter(prefix="/admin/labels", tags=["admin"], dependencies=[Depends(require_admin)])
Admin = Annotated[User, Depends(require_admin)]

DRAFT_TASK = "bonsai_worker.tasks.labeling.draft"
MAX_BATCH = 200
MAX_MASK_BYTES = 8 * 1024 * 1024
OBJ_ID = re.compile(r"^(trunk|root|branch_[a-z0-9]{1,16})$")
Cls = Literal["trunk", "branch", "root"]


class LabelObject(BaseModel):
    id: str
    cls: Cls
    accepted: bool = True
    source: str | None = None
    mask_url: str | None = None


class LabelRow(BaseModel):
    id: uuid.UUID
    status: SegLabelStatus
    source: str
    thumb_url: str | None
    objects: int
    accepted: int
    draft_source: str | None
    error: str | None


class LabelList(BaseModel):
    counts: dict[str, int]
    eligible_jobs: int
    items: list[LabelRow]


class LabelDetail(BaseModel):
    id: uuid.UUID
    status: SegLabelStatus
    image_url: str
    width: int
    height: int
    objects: list[LabelObject]
    draft_source: str | None
    summary_vi: str | None
    next_id: uuid.UUID | None


class LabelUpdate(BaseModel):
    status: Literal["draft", "reviewed", "rejected"] | None = None
    objects: list[LabelObject] | None = None  # danh sách mới: đối tượng không có mặt bị xóa


class CreateFromUploads(BaseModel):
    keys: list[str] = Field(min_length=1, max_length=MAX_BATCH)


class CreateFromJobs(BaseModel):
    limit: int = Field(default=50, ge=1, le=MAX_BATCH)


def _get(db, label_id: uuid.UUID) -> SegLabel:
    label = db.get(SegLabel, label_id)
    if label is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ảnh gán nhãn.")
    return label


def _eligible_jobs(db):
    """Phiên A có ảnh mặt tiền + phân tích dùng được, của người đồng ý cho dùng ảnh huấn luyện (hoặc admin), chưa có nhãn."""
    labelled = select(SegLabel.job_id).where(SegLabel.job_id.isnot(None))
    return (
        select(DesignJob)
        .join(User, User.id == DesignJob.user_id)
        .where(DesignJob.front_photo_id.isnot(None), DesignJob.analysis.isnot(None),
               DesignJob.analysis["image_quality"]["usable"].as_boolean().is_(True),
               or_(User.consent_training.is_(True), User.role == UserRole.admin), User.deleted_at.is_(None),
               DesignJob.id.not_in(labelled))
    )


@router.get("", response_model=LabelList)
def list_labels(db: DB, status_: Annotated[SegLabelStatus | None, Query(alias="status")] = None, limit: int = 60):
    counts = {s.value: 0 for s in SegLabelStatus}
    for st, n in db.execute(select(SegLabel.status, func.count()).group_by(SegLabel.status)):
        counts[st.value] = n
    q = select(SegLabel).order_by(SegLabel.created_at.desc()).limit(min(limit, 200))
    if status_:
        q = q.where(SegLabel.status == status_)
    items = [
        LabelRow(id=lb.id, status=lb.status, source=lb.source,
                 thumb_url=storage.presign_get(lb.image_key) if lb.width else None,
                 objects=len(lb.objects or []), accepted=sum(bool(o.get("accepted")) for o in lb.objects or []),
                 draft_source=lb.draft_source, error=lb.error)
        for lb in db.execute(q).scalars()
    ]
    eligible = db.execute(select(func.count()).select_from(_eligible_jobs(db).subquery())).scalar_one()
    return LabelList(counts=counts, eligible_jobs=eligible, items=items)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_from_uploads(body: CreateFromUploads, db: DB, admin: Admin):
    prefix = upload_prefix(admin.id)
    if any(not k.startswith(prefix) for k in body.keys):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ảnh không thuộc lượt tải lên của bạn.")
    rows = [SegLabel(source="upload", image_key=k, objects=[]) for k in body.keys]
    db.add_all(rows)
    db.commit()
    for r in rows:
        enqueue(DRAFT_TASK, str(r.id))
    return {"created": len(rows)}


@router.post("/from-jobs", status_code=status.HTTP_201_CREATED)
def create_from_jobs(body: CreateFromJobs, db: DB):
    from ..db.models import TreePhoto

    jobs = db.execute(_eligible_jobs(db).order_by(DesignJob.created_at.desc()).limit(body.limit)).scalars().all()
    rows = []
    for job in jobs:
        photo = db.get(TreePhoto, job.front_photo_id)
        if photo is None:
            continue
        # Dùng lại ảnh đã chuẩn hóa + phân tích của phiên A (không gọi lại P1). Ảnh chưa chuẩn hóa (hiếm) → worker
        # chuẩn hóa thành bản sao riêng, không đụng ảnh của người dùng.
        rows.append(SegLabel(source="job", job_id=job.id, image_key=photo.storage_key, width=photo.width,
                             height=photo.height, analysis=job.analysis, objects=[]))
    db.add_all(rows)
    db.commit()
    for r in rows:
        enqueue(DRAFT_TASK, str(r.id))
    return {"created": len(rows)}


@router.get("/{label_id}", response_model=LabelDetail)
def get_label(label_id: uuid.UUID, db: DB):
    lb = _get(db, label_id)
    if not lb.width:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ảnh đang được chuẩn bị, thử lại sau ít giây.")
    nxt = db.execute(
        select(SegLabel.id).where(SegLabel.status == SegLabelStatus.draft, SegLabel.id != lb.id)
        .order_by(SegLabel.created_at).limit(1)
    ).scalar_one_or_none()
    return LabelDetail(
        id=lb.id, status=lb.status, image_url=storage.presign_get(lb.image_key), width=lb.width, height=lb.height,
        objects=[LabelObject(id=o["id"], cls=o["cls"], accepted=o.get("accepted", True), source=o.get("source"),
                             mask_url=storage.presign_get(o["key"])) for o in lb.objects or []],
        draft_source=lb.draft_source, summary_vi=(lb.analysis or {}).get("summary_vi"), next_id=nxt,
    )


@router.put("/{label_id}", response_model=LabelDetail)
def update_label(label_id: uuid.UUID, body: LabelUpdate, db: DB, admin: Admin):
    lb = _get(db, label_id)
    if body.objects is not None:
        current = {o["id"]: o for o in lb.objects or []}
        new = []
        for o in body.objects:
            if o.id not in current:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Chưa có mask cho {o.id}.")
            new.append({**current[o.id], "cls": o.cls, "accepted": o.accepted})
        for gone in current.keys() - {o.id for o in body.objects}:
            storage.delete(current[gone]["key"])
        lb.objects = new
    if body.status:
        if body.status == "reviewed" and not any(o["cls"] == "trunk" and o.get("accepted") for o in lb.objects or []):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cần ít nhất một mask thân đúng trước khi duyệt.")
        lb.status = SegLabelStatus(body.status)
        lb.reviewed_by = admin.email if body.status != "draft" else None
    db.commit()
    return get_label(label_id, db)


@router.get("/{label_id}/objects/{obj_id}/mask")
def get_mask(label_id: uuid.UUID, obj_id: str, db: DB):
    """PNG mask qua api (cùng origin) — trình duyệt vẽ lên canvas rồi xuất lại được (URL ký sẵn khác origin thì canvas bị khóa)."""
    lb = _get(db, label_id)
    obj = next((o for o in lb.objects or [] if o["id"] == obj_id), None)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không có đối tượng này.")
    return Response(storage.get_bytes(obj["key"]), media_type="image/png", headers={"Cache-Control": "no-store"})


@router.put("/{label_id}/objects/{obj_id}/mask", response_model=LabelObject)
async def put_mask(label_id: uuid.UUID, obj_id: str, request: Request, db: DB, cls: Cls | None = None):
    """Thân request là PNG (trắng = đối tượng). Đối tượng mới (vd. cành bị sót) cần `?cls=`."""
    if not OBJ_ID.match(obj_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mã đối tượng không hợp lệ.")
    lb = _get(db, label_id)
    data = await request.body()
    if not data or len(data) > MAX_MASK_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mask rỗng hoặc quá lớn.")
    try:
        mask = read_mask(data, (lb.width, lb.height))
    except Exception as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Mask không hợp lệ: {e}") from e
    objects = list(lb.objects or [])
    obj = next((o for o in objects if o["id"] == obj_id), None)
    if obj is None:
        if cls is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Đối tượng mới cần loại (cls).")
        obj = {"id": obj_id, "cls": cls, "key": f"labels/{lb.id}/{obj_id}.png", "accepted": True}
        objects.append(obj)
    obj = {**obj, "source": "manual", **({"cls": cls} if cls else {})}
    storage.put_bytes(obj["key"], mask_png(mask), "image/png")
    lb.objects = [obj if o["id"] == obj_id else o for o in objects]
    db.commit()
    return LabelObject(id=obj["id"], cls=obj["cls"], accepted=obj["accepted"], source="manual",
                       mask_url=storage.presign_get(obj["key"]))


@router.post("/{label_id}/redraft", status_code=status.HTTP_202_ACCEPTED)
def redraft(label_id: uuid.UUID, db: DB):
    """Tạo lại mask nháp (vd. sau khi worker có SAM). Xóa chỉnh sửa hiện tại."""
    lb = _get(db, label_id)
    for o in lb.objects or []:
        storage.delete(o["key"])
    lb.objects, lb.status, lb.error = [], SegLabelStatus.pending, None
    db.commit()
    enqueue(DRAFT_TASK, str(lb.id))
    return {"status": "pending"}
