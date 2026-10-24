"""Tải lịch chăm sóc (Excel) và thêm nhắc việc vào lịch điện thoại (.ics) cho một kết quả.

Link tải không mang được header đăng nhập (thẻ <a>, ứng dụng Lịch của iPhone mở URL trực tiếp) → api phát link ký sẵn
có hạn 1 giờ: POST /jobs/{id}/exports trả URL, GET kiểm chữ ký.
"""

import hashlib
import hmac
import time
import uuid
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel

from ..db.models import DesignJob, JobStatus, Species, Tree, User
from ..security import DB, CurrentUser
from ..services.care_calendar import care_calendar_ics, care_plan_xlsx, result_start
from ..services.results import result_full
from ..settings import get_settings

router = APIRouter(tags=["exports"])
TTL = 3600
KINDS = {"care-plan.xlsx", "calendar.ics"}


def _sign(job_id: uuid.UUID, kind: str, exp: int) -> str:
    msg = f"{job_id}:{kind}:{exp}".encode()
    return hmac.new(get_settings().jwt_secret.encode(), msg, hashlib.sha256).hexdigest()[:32]


class ExportLinks(BaseModel):
    xlsx_url: str
    ics_url: str
    expires_in: int


@router.post("/jobs/{job_id}/exports", response_model=ExportLinks)
def export_links(job_id: uuid.UUID, user: CurrentUser, db: DB):
    job = db.get(DesignJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phiên thiết kế.")
    if job.status != JobStatus.done:
        raise HTTPException(status.HTTP_409_CONFLICT, "Kết quả chưa sẵn sàng.")
    exp = int(time.time()) + TTL
    base = f"{get_settings().public_base_url.rstrip('/')}/api/v1/exports/{job_id}"
    return ExportLinks(
        xlsx_url=f"{base}/care-plan.xlsx?exp={exp}&sig={_sign(job_id, 'care-plan.xlsx', exp)}",
        ics_url=f"{base}/calendar.ics?exp={exp}&sig={_sign(job_id, 'calendar.ics', exp)}",
        expires_in=TTL,
    )


@router.get("/exports/{job_id}/{kind}")
def download(job_id: uuid.UUID, kind: str, exp: int, sig: str, db: DB):
    if kind not in KINDS or exp < time.time() or not hmac.compare_digest(sig, _sign(job_id, kind, exp)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Link đã hết hạn, bạn bấm tải lại trong app nhé.")
    job = db.get(DesignJob, job_id)
    if job is None or job.status != JobStatus.done:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy kết quả.")
    user, tree = db.get(User, job.user_id), db.get(Tree, job.tree_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy kết quả.")
    result = result_full(db, job, user)
    start = result_start(job.finished_at)
    slug = "".join(c if c.isalnum() else "-" for c in (tree.nickname if tree and tree.nickname else "cay")).strip("-") or "cay"
    if kind == "care-plan.xlsx":
        species = db.get(Species, tree.species_key) if tree and tree.species_key else None
        data = care_plan_xlsx(result, start, species_vi=species.name_vi if species else None)
        media, filename = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", f"lich-cham-soc-{slug}.xlsx"
    else:
        url = f"{get_settings().public_base_url.rstrip('/')}/ket-qua/{job.id}"
        data = care_calendar_ics(result, start, url=url)
        media, filename = "text/calendar; charset=utf-8", f"nhac-viec-{slug}.ics"
    disp = "inline" if kind == "calendar.ics" else "attachment"  # .ics mở thẳng bằng ứng dụng Lịch
    return Response(data, media_type=media, headers={
        "Content-Disposition": f"{disp}; filename=\"{filename.encode('ascii', 'ignore').decode()}\"; filename*=UTF-8''{quote(filename)}",
        "Cache-Control": "private, no-store",
    })
