"""Schema PostgreSQL (docs/architecture.md §4). Worker dùng chung các model này."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSONB, list[Any]: JSONB}


Base.metadata.naming_convention = NAMING


def _enum(e: type[enum.Enum], name: str) -> Enum:
    # Lưu dạng chuỗi + CHECK để thêm giá trị mới chỉ cần migration nhẹ.
    return Enum(e, name=name, native_enum=False, create_constraint=True, length=32,
                values_callable=lambda x: [m.value for m in x])


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class UserRole(str, enum.Enum):
    player = "player"
    nursery = "nursery"
    artisan = "artisan"  # nghệ nhân: chấm ảnh / thiết kế, chỉnh bộ luật (không thấy người dùng, tiền)
    admin = "admin"


class AuthProvider(str, enum.Enum):
    google = "google"
    zalo = "zalo"
    dev = "dev"


class JobStatus(str, enum.Enum):
    queued = "queued"
    analyzing = "analyzing"
    designing = "designing"
    awaiting_choice = "awaiting_choice"
    rendering_final = "rendering_final"
    judging = "judging"
    rendering_stages = "rendering_stages"
    writing_guide = "writing_guide"
    done = "done"
    failed = "failed"


class CreditReason(str, enum.Enum):
    purchase = "purchase"
    render = "render"
    refund = "refund"
    gift = "gift"
    adjust = "adjust"  # admin cộng/trừ tay, có ghi lý do trong admin_audit
    referral = "referral"  # giới thiệu bạn: cả hai bên được tặng
    reward = "reward"  # thưởng (nhật ký đúng mốc, thử thách…)
    consult = "consult"  # trả lượt để hỏi nghệ nhân


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    expired = "expired"
    cancelled = "cancelled"


class PhotoSource(str, enum.Enum):
    upload = "upload"
    progress = "progress"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    auth_provider: Mapped[AuthProvider] = mapped_column(_enum(AuthProvider, "auth_provider"))
    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True)
    zalo_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    name: Mapped[str | None] = mapped_column(String(200))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(32))
    garden_name: Mapped[str | None] = mapped_column(String(120))  # nhà vườn: in lên ảnh chia sẻ
    # Đồng ý (không bắt buộc) cho phép dùng ảnh để cải thiện AI; rút lại được bất cứ lúc nào.
    consent_training: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notify_zalo: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    # Xóa mềm: dữ liệu giữ nguyên, tài khoản không đăng nhập/hiển thị được nữa (admin khôi phục được).
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    role: Mapped[UserRole] = mapped_column(_enum(UserRole, "user_role"), default=UserRole.player)
    referral_code: Mapped[str | None] = mapped_column(String(12), unique=True)  # mã giới thiệu của chính người này
    referred_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    birth_year: Mapped[int | None] = mapped_column(SmallInteger)  # gợi ý cây hợp mệnh (không bắt buộc)
    province: Mapped[str | None] = mapped_column(String(32))  # mã tỉnh: lịch Mai kịp Tết, nhắc theo thời tiết
    # hồ sơ công khai (nghệ nhân, nhà vườn)
    public_slug: Mapped[str | None] = mapped_column(String(40), unique=True)
    bio: Mapped[str | None] = mapped_column(Text)
    specialties: Mapped[list[Any]] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    nursery_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # gói nhà vườn còn hạn tới
    # Cache; nguồn gốc là credit_ledger (xem services/credits.py).
    credits: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = _created()

    __table_args__ = (CheckConstraint("credits >= 0", name="credits_non_negative"),)


class PushSubscription(Base):
    """Đăng ký Web Push của một trình duyệt/thiết bị."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(100))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = _created()


class Tree(Base):
    __tablename__ = "trees"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    nickname: Mapped[str | None] = mapped_column(String(120))
    species_key: Mapped[str | None] = mapped_column(ForeignKey("species.key"))
    real_height_cm: Mapped[float | None] = mapped_column(Float)
    passport_code: Mapped[str | None] = mapped_column(String(12), unique=True)  # sổ hồ sơ cây (QR)
    passport_public: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    stolen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # chủ báo mất
    created_at: Mapped[datetime] = _created()

    photos: Mapped[list[TreePhoto]] = relationship(
        back_populates="tree", order_by="TreePhoto.view_index", cascade="all, delete-orphan"
    )


class TreePhoto(Base):
    __tablename__ = "tree_photos"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tree_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trees.id", ondelete="CASCADE"), index=True)
    # Ảnh đã chuẩn hóa (A0); trước khi A0 chạy, trỏ tới ảnh thô trong uploads/ (tự xóa sau 1 ngày).
    storage_key: Mapped[str] = mapped_column(Text)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    view_index: Mapped[int] = mapped_column(SmallInteger, default=0)
    is_front: Mapped[bool] = mapped_column(Boolean, default=False)
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[PhotoSource] = mapped_column(_enum(PhotoSource, "photo_source"), default=PhotoSource.upload)
    created_at: Mapped[datetime] = _created()

    tree: Mapped[Tree] = relationship(back_populates="photos")


class DesignJob(Base):
    __tablename__ = "design_jobs"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tree_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trees.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[JobStatus] = mapped_column(_enum(JobStatus, "job_status"), default=JobStatus.queued)
    analysis: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    targets: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    chosen_option_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("design_options.id", use_alter=True, ondelete="SET NULL")
    )
    prompt_version: Mapped[str | None] = mapped_column(String(64))
    # Ảnh mặt tiền dùng làm hệ tọa độ cho P1/P2/sketch/P3.
    front_photo_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tree_photos.id", ondelete="SET NULL"))
    inputs: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # style ưa thích, mục đích
    # Tiến độ chi tiết cho màn 04: {"steps": {"species": {...}, "trunk": ..., ...}}
    progress: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    report: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    share_code: Mapped[str | None] = mapped_column(String(16), unique=True)
    # Mã tham chiếu lần trừ lượt hiện tại trong credit_ledger: "<job_id>" lần đầu, "<job_id>#2"… khi thử lại.
    charge_ref: Mapped[str | None] = mapped_column(String(64))  # P5: nhận xét phôi, lý do chọn thế, lộ trình năm
    error: Mapped[str | None] = mapped_column(Text)
    error_code: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = _created()
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    options: Mapped[list[DesignOption]] = relationship(
        back_populates="job", foreign_keys="DesignOption.job_id", order_by="DesignOption.rank"
    )

    __table_args__ = (Index("ix_design_jobs_user_created", "user_id", "created_at"),)


class DesignOption(Base):
    __tablename__ = "design_options"

    id: Mapped[uuid.UUID] = _uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("design_jobs.id", ondelete="CASCADE"), index=True)
    rank: Mapped[int] = mapped_column(SmallInteger)
    style_key: Mapped[str] = mapped_column(ForeignKey("styles.key"))
    suitability: Mapped[float] = mapped_column(Float)
    design: Mapped[dict[str, Any]] = mapped_column(JSONB)
    sketch_svg_key: Mapped[str | None] = mapped_column(Text)
    sketch_png_key: Mapped[str | None] = mapped_column(Text)
    sketch_meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # số cành cắt/giữ/nuôi, hạ ngọn

    job: Mapped[DesignJob] = relationship(back_populates="options", foreign_keys=[job_id])

    __table_args__ = (UniqueConstraint("job_id", "rank", name="uq_design_options_job_rank"),)


class Stage(Base):
    __tablename__ = "stages"

    id: Mapped[uuid.UUID] = _uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("design_jobs.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(2))
    time_from_start: Mapped[str | None] = mapped_column(String(64))
    plan: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    guide_vi: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    image_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("render_images.id", ondelete="SET NULL"))

    __table_args__ = (
        UniqueConstraint("job_id", "code", name="uq_stages_job_code"),
        CheckConstraint("code IN ('S0','S1','S2','S3','S4')", name="code_valid"),
    )


class StageTaskCheck(Base):
    """Checkbox "Việc cần làm" ở màn 06, lưu theo cây (qua job) để người dùng theo dõi tiến độ thật."""

    __tablename__ = "stage_task_checks"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("design_jobs.id", ondelete="CASCADE"), index=True)
    stage_code: Mapped[str] = mapped_column(String(2))
    task_index: Mapped[int] = mapped_column(SmallInteger)
    done_at: Mapped[datetime] = _created()

    __table_args__ = (UniqueConstraint("job_id", "stage_code", "task_index", name="uq_stage_task_checks_task"),)


class RenderImage(Base):
    """Mọi ảnh sinh ra, kể cả ảnh bị loại (selected=false) — dataset về sau."""

    __tablename__ = "render_images"

    id: Mapped[uuid.UUID] = _uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("design_jobs.id", ondelete="CASCADE"), index=True)
    stage_code: Mapped[str] = mapped_column(String(2))
    attempt: Mapped[int] = mapped_column(SmallInteger, default=0)
    storage_key: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(100))
    prompt_hash: Mapped[str | None] = mapped_column(String(64))
    cv_checks: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    judge: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    total_score: Mapped[float | None] = mapped_column(Float)
    selected: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    created_at: Mapped[datetime] = _created()


class PipelineStep(Base):
    __tablename__ = "pipeline_steps"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("design_jobs.id", ondelete="SET NULL"), index=True)
    step_code: Mapped[str] = mapped_column(String(32))
    provider: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str | None] = mapped_column(String(64))
    input_ref: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    output: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    images_out: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 6), default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    ok: Mapped[bool] = mapped_column(Boolean)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created()

    __table_args__ = (Index("ix_pipeline_steps_created_at", "created_at"),)


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[uuid.UUID] = _uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("design_jobs.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    rating: Mapped[int] = mapped_column(SmallInteger)  # 1 = Hợp lý, -1 = Chưa đúng
    reason_tags: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created()

    __table_args__ = (
        UniqueConstraint("job_id", "user_id", name="uq_feedback_job_user"),
        CheckConstraint("rating IN (-1, 1)", name="rating_valid"),
    )


class CreditLedger(Base):
    """Chỉ ghi thêm. Mỗi (user, reason, ref_id) tối đa một dòng → hoàn lượt / nạp tiền idempotent."""

    __tablename__ = "credit_ledger"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    delta: Mapped[int] = mapped_column(Integer)
    reason: Mapped[CreditReason] = mapped_column(_enum(CreditReason, "credit_reason"))
    ref_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = _created()

    __table_args__ = (
        Index(
            "uq_credit_ledger_user_reason_ref",
            "user_id", "reason", "ref_id",
            unique=True,
            postgresql_where=text("ref_id IS NOT NULL"),
        ),
        CheckConstraint("delta <> 0", name="delta_non_zero"),
    )


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    amount_vnd: Mapped[int] = mapped_column(Integer)
    package_code: Mapped[str] = mapped_column(String(32))
    transfer_code: Mapped[str] = mapped_column(String(32), unique=True)
    status: Mapped[PaymentStatus] = mapped_column(_enum(PaymentStatus, "payment_status"), default=PaymentStatus.pending)
    provider: Mapped[str | None] = mapped_column(String(16))  # sepay | casso
    provider_txn_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    raw: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # Số lượt chốt lúc tạo đơn (admin đổi gói sau đó không ảnh hưởng đơn đã tạo). NULL ở đơn cũ → lấy theo gói.
    credits: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = _created()
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PromptVersion(Base):
    __tablename__ = "prompt_versions"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    step_code: Mapped[str] = mapped_column(String(32))
    version: Mapped[str] = mapped_column(String(32))
    kind: Mapped[str] = mapped_column(String(16), default="llm")
    template: Mapped[dict[str, Any]] = mapped_column(JSONB)  # {"system": str | null, "user": str}
    description: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _created()

    __table_args__ = (
        UniqueConstraint("step_code", "version", name="uq_prompt_versions_step_version"),
        Index("uq_prompt_versions_one_active", "step_code", unique=True, postgresql_where=text("active")),
    )


class Species(Base):
    __tablename__ = "species"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    name_vi: Mapped[str] = mapped_column(String(100))
    prompt_desc_en: Mapped[str] = mapped_column(Text)
    growth_speed: Mapped[str] = mapped_column(String(16))
    ref_image_keys: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    admin_edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # có → seed không ghi đè

    __table_args__ = (CheckConstraint("growth_speed IN ('slow','medium','fast')", name="growth_speed_valid"),)


class Style(Base):
    __tablename__ = "styles"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    name_vi: Mapped[str] = mapped_column(String(100))
    name_jp: Mapped[str | None] = mapped_column(String(100))
    prompt_desc_en: Mapped[str] = mapped_column(Text)
    growth_speed: Mapped[str | None] = mapped_column(String(16))
    ref_image_keys: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    admin_edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # có → seed không ghi đè


class AppSetting(Base):
    """Cấu hình vận hành đổi được lúc chạy từ trang admin (vd. `cost_mode`)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by: Mapped[str | None] = mapped_column(String(320))


class SegLabelStatus(str, enum.Enum):
    pending = "pending"  # chờ worker tạo mask nháp
    draft = "draft"  # có mask nháp, chờ duyệt
    reviewed = "reviewed"  # đã duyệt → vào bộ dữ liệu huấn luyện
    rejected = "rejected"  # ảnh không dùng được
    failed = "failed"


class SegLabel(Base):
    """Một ảnh trong bộ dữ liệu huấn luyện YOLO-seg 3 lớp (thân / cành / rễ), gán nhãn ở /admin → Gán nhãn.

    objects: [{"id": "trunk" | "branch_b1" | "root" | "branch_m1…", "cls": "trunk|branch|root",
               "key": "<mask png>", "source": "sam|geometry|manual", "accepted": bool}]
    """

    __tablename__ = "seg_labels"

    id: Mapped[uuid.UUID] = _uuid_pk()
    source: Mapped[str] = mapped_column(String(16))  # upload | job
    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("design_jobs.id", ondelete="SET NULL"), unique=True)
    image_key: Mapped[str] = mapped_column(Text)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    analysis: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    objects: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    status: Mapped[SegLabelStatus] = mapped_column(_enum(SegLabelStatus, "seg_label_status"), default=SegLabelStatus.pending, index=True)
    draft_source: Mapped[str | None] = mapped_column(String(16))  # sam | geometry
    error: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[str | None] = mapped_column(String(320))
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AdminAudit(Base):
    """Nhật ký thao tác của admin (đổi vai trò, cộng/trừ lượt, xác nhận thanh toán, chạy lại phiên, đổi cấu hình…)."""

    __tablename__ = "admin_audit"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    admin_email: Mapped[str | None] = mapped_column(String(320), index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    target_type: Mapped[str | None] = mapped_column(String(32))
    target_id: Mapped[str | None] = mapped_column(String(64), index=True)
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = _created()


class GiftCode(Base):
    """Mã quà tặng: người dùng nhập ở trang Tài khoản / Mua lượt để nhận lượt (admin tạo ở /admin/ma-qua-tang)."""

    __tablename__ = "gift_codes"

    code: Mapped[str] = mapped_column(String(32), primary_key=True)  # chữ in hoa, không dấu
    credits: Mapped[int] = mapped_column(Integer)
    max_uses: Mapped[int | None] = mapped_column(Integer)  # NULL = không giới hạn
    used: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    note: Mapped[str | None] = mapped_column(String(200))
    created_by: Mapped[str | None] = mapped_column(String(320))
    created_at: Mapped[datetime] = _created()

    __table_args__ = (CheckConstraint("credits > 0", name="credits_positive"),)


class GiftRedemption(Base):
    __tablename__ = "gift_redemptions"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    code: Mapped[str] = mapped_column(ForeignKey("gift_codes.code", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = _created()

    __table_args__ = (UniqueConstraint("code", "user_id", name="uq_gift_redemptions_code_user"),)


class RuleDoc(Base):
    """Một phiên bản bộ luật (rule_set / styles_vn / species / judging). Seed từ rules/*.yaml; nghệ nhân sửa trên
    giao diện tạo phiên bản mới; mỗi bộ chỉ một bản `active` (worker đọc ở đầu mỗi phiên)."""

    __tablename__ = "rule_docs"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    doc: Mapped[str] = mapped_column(String(32), index=True)
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB)
    note: Mapped[str | None] = mapped_column(String(300))
    active: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    created_by: Mapped[str | None] = mapped_column(String(320))
    created_at: Mapped[datetime] = _created()
    activated_by: Mapped[str | None] = mapped_column(String(320))
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("doc", "version", name="uq_rule_docs_doc_version"),
        Index("uq_rule_docs_one_active", "doc", unique=True, postgresql_where=text("active")),  # mỗi bộ một bản áp dụng
    )


class ArtisanReview(Base):
    """Nghệ nhân chấm một ảnh kết quả (S4) hoặc một phương án thiết kế (bản vẽ) theo bảng chấm (judging)."""

    __tablename__ = "artisan_reviews"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))  # image | design
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("design_jobs.id", ondelete="CASCADE"), index=True)
    render_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("render_images.id", ondelete="CASCADE"))
    option_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("design_options.id", ondelete="CASCADE"))
    reviewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scores: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)  # tiêu chí → 1..10
    hard_fails: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    total: Mapped[float | None] = mapped_column(Numeric(5, 2))  # thang 100 theo trọng số bảng chấm
    passed: Mapped[bool] = mapped_column(Boolean)
    comment: Mapped[str | None] = mapped_column(Text)
    rules_version: Mapped[int | None] = mapped_column(Integer)  # phiên bản bảng chấm lúc chấm
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("kind IN ('image', 'design')", name="kind_valid"),
        CheckConstraint("(render_id IS NOT NULL) OR (option_id IS NOT NULL)", name="has_target"),
        UniqueConstraint("reviewer_id", "render_id", name="uq_artisan_reviews_reviewer_render"),
        UniqueConstraint("reviewer_id", "option_id", name="uq_artisan_reviews_reviewer_option"),
    )


# ---------- tăng trưởng, cộng đồng (docs/ideas.md B, F) ----------


class Referral(Base):
    """Giới thiệu bạn: người được mời phân tích phôi đầu tiên thì cả hai được tặng lượt (một lần)."""

    __tablename__ = "referrals"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    referrer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    referee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    rewarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()


class DesignVote(Base):
    """Quẹt chọn dáng: giữa hai phương án của cùng một phôi, người dùng thấy cái nào đẹp hơn (dữ liệu thẩm mỹ)."""

    __tablename__ = "design_votes"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("design_jobs.id", ondelete="CASCADE"), index=True)
    winner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("design_options.id", ondelete="CASCADE"))
    loser_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("design_options.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = _created()

    __table_args__ = (UniqueConstraint("user_id", "winner_id", "loser_id", name="uq_design_votes_pair"),)


class TreeTransfer(Base):
    """Chuyển chủ cây (sổ hồ sơ cây): chủ cũ tạo mã, chủ mới nhập mã để nhận cây kèm toàn bộ lịch sử."""

    __tablename__ = "tree_transfers"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    tree_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trees.id", ondelete="CASCADE"), index=True)
    from_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    to_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    code: Mapped[str] = mapped_column(String(12), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()


class Challenge(Base):
    """Thử thách phôi hằng tháng: cùng một phôi, mọi người tự thiết kế, cộng đồng bình chọn."""

    __tablename__ = "challenges"

    id: Mapped[uuid.UUID] = _uuid_pk()
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("design_jobs.id", ondelete="RESTRICT"))  # phôi đã phân tích
    prize: Mapped[str | None] = mapped_column(String(200))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()


class ChallengeEntry(Base):
    __tablename__ = "challenge_entries"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    challenge_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("challenges.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    design: Mapped[dict[str, Any]] = mapped_column(JSONB)  # UserDesignIn (bonsai_pipeline/user_design.py)
    image_key: Mapped[str] = mapped_column(Text)  # ảnh ghép từ thư viện chi tiết (studio_compose)
    votes: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = _created()

    __table_args__ = (UniqueConstraint("challenge_id", "user_id", name="uq_challenge_entries_user"),)


class ChallengeVote(Base):
    __tablename__ = "challenge_votes"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    challenge_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("challenges.id", ondelete="CASCADE"))
    entry_id: Mapped[int] = mapped_column(ForeignKey("challenge_entries.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = _created()

    __table_args__ = (UniqueConstraint("challenge_id", "user_id", name="uq_challenge_votes_user"),)  # mỗi người 1 phiếu


# ---------- nhà vườn, dịch vụ (docs/ideas.md C, D) ----------


class Listing(Base):
    """Tin đăng phôi / cây của nhà vườn, kèm dáng tương lai AI; liên hệ trực tiếp (không giữ tiền)."""

    __tablename__ = "listings"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(12), unique=True)  # link /tin/{code}, mã QR treo chậu
    tree_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("trees.id", ondelete="SET NULL"))
    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("design_jobs.id", ondelete="SET NULL"))  # phương án AI
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    species_key: Mapped[str | None] = mapped_column(ForeignKey("species.key"))
    kind: Mapped[str] = mapped_column(String(16), default="phoi")  # phoi | cay | nuoi_ho (bán kèm nuôi hộ)
    price_vnd: Mapped[int | None] = mapped_column(BigInteger)
    height_cm: Mapped[float | None] = mapped_column(Float)
    trunk_cm: Mapped[float | None] = mapped_column(Float)
    province: Mapped[str | None] = mapped_column(String(32))
    contact_phone: Mapped[str | None] = mapped_column(String(32))
    photo_key: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="active", index=True)  # active | sold | hidden
    featured_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    views: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())


class PartnerPot(Base):
    """Chậu của xưởng đối tác (Bát Tràng…): gợi ý theo thiết kế, link mua có mã giới thiệu."""

    __tablename__ = "partner_pots"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    maker: Mapped[str | None] = mapped_column(String(120))
    shape: Mapped[str] = mapped_column(String(16))  # rectangle | oval | round | cascade_deep
    color: Mapped[str | None] = mapped_column(String(32))  # unglazed_brown | glazed_blue | glazed_cream
    length_cm: Mapped[float | None] = mapped_column(Float)
    price_vnd: Mapped[int | None] = mapped_column(BigInteger)
    url: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = _created()


class Consult(Base):
    """Hỏi nghệ nhân: người dùng trả lượt, gửi thiết kế + câu hỏi; nghệ nhân trả lời (không trả lời → hoàn lượt)."""

    __tablename__ = "consults"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("design_jobs.id", ondelete="CASCADE"))
    option_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("design_options.id", ondelete="SET NULL"))
    artisan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str | None] = mapped_column(Text)
    verdict: Mapped[str | None] = mapped_column(String(16))  # ok | fix | rethink
    credits: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)  # open | answered | refunded
    rating: Mapped[int | None] = mapped_column(SmallInteger)  # người hỏi chấm câu trả lời 1–5
    created_at: Mapped[datetime] = _created()
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CareRequest(Base):
    """Chăm hộ (đi xa) / nuôi hộ (mua phôi, để nhà vườn chăm theo lộ trình): nhà vườn đăng ảnh cập nhật."""

    __tablename__ = "care_requests"

    id: Mapped[uuid.UUID] = _uuid_pk()
    kind: Mapped[str] = mapped_column(String(16))  # care | grow
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    nursery_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    tree_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trees.id", ondelete="CASCADE"))
    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("design_jobs.id", ondelete="SET NULL"))  # lộ trình theo dõi
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="requested", index=True)  # requested|active|done|declined
    created_at: Mapped[datetime] = _created()


class CareUpdate(Base):
    __tablename__ = "care_updates"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("care_requests.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    photo_key: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created()


class HealthCheck(Base):
    """Chụp lá / cành → AI đoán sâu bệnh + cách xử lý (docs/ideas.md E3)."""

    __tablename__ = "health_checks"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    tree_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("trees.id", ondelete="SET NULL"))
    photo_key: Mapped[str] = mapped_column(Text)
    symptoms: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued | done | failed
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = _created()


class AssistantQuestion(Base):
    """Hỏi đáp chăm cây bằng giọng nói / chữ (docs/ideas.md E4): trả lời từ bảng loài, hoặc AI nếu bật."""

    __tablename__ = "assistant_questions"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    tree_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("trees.id", ondelete="SET NULL"))
    question: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued | done | failed
    answer: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = _created()
