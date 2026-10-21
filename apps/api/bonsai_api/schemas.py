from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class GoogleLogin(BaseModel):
    id_token: str = Field(min_length=10)


class ZaloLogin(BaseModel):
    code: str = Field(min_length=4)
    code_verifier: str = Field(min_length=43, max_length=128)


class DevLogin(BaseModel):
    email: str
    name: str | None = None


class UserOut(ORM):
    id: uuid.UUID
    name: str | None
    email: str | None
    avatar_url: str | None
    role: str
    credits: int


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut
    is_new: bool


UploadContentType = Literal["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]


class PresignIn(BaseModel):
    content_type: UploadContentType
    size_bytes: int = Field(gt=0)


class PresignOut(BaseModel):
    key: str
    url: str
    method: Literal["PUT"] = "PUT"
    headers: dict[str, str]
    expires_in: int


class PhotoIn(BaseModel):
    key: str
    view_index: int = Field(ge=0, le=3)
    is_front: bool = False


class TreeCreate(BaseModel):
    nickname: str | None = Field(default=None, max_length=120)
    species_key: str | None = None
    real_height_cm: float | None = Field(default=None, gt=0, lt=1000)
    photos: list[PhotoIn] = Field(min_length=1, max_length=4)


class PhotoOut(ORM):
    id: uuid.UUID
    view_index: int
    is_front: bool
    url: str | None = None


class TreeOut(ORM):
    id: uuid.UUID
    nickname: str | None
    species_key: str | None
    real_height_cm: float | None
    created_at: datetime
    photos: list[PhotoOut] = []


class SpeciesOut(ORM):
    key: str
    name_vi: str
    growth_speed: str


class StyleOut(ORM):
    key: str
    name_vi: str
    name_jp: str | None


class JobCreate(BaseModel):
    style: str | None = Field(default=None, max_length=32)
    goal: Literal["display", "sale", "gift"] | None = None


class ChooseIn(BaseModel):
    option_id: uuid.UUID


class PhotoRef(BaseModel):
    id: uuid.UUID
    url: str
    width: int | None
    height: int | None


class AnalysisSummary(BaseModel):
    usable: bool
    issues: list[str] = []
    species_key: str | None = None
    species_confidence: float | None = None
    summary_vi: str = ""
    branch_count: int = 0
    height_cm: float | None = None
    base_diameter_cm: float | None = None
    lower_apex_cm: float | None = None


class OptionOut(BaseModel):
    id: uuid.UUID
    rank: int
    style_key: str
    name_vi: str
    name_jp: str | None
    suitability: float
    why_vi: str
    care_steps_vi: list[str]
    remove_reasons_vi: list[str]
    new_branch_notes_vi: list[str]
    counts: dict
    sketch_svg_url: str | None


class ResultOut(BaseModel):
    final_url: str
    years: int | None
    low_confidence: bool
    chosen_style_vi: str | None


class JobOut(BaseModel):
    id: uuid.UUID
    tree_id: uuid.UUID
    tree_nickname: str | None
    status: str
    error_code: str | None
    progress: dict
    created_at: datetime
    front_photo: PhotoRef | None
    analysis: AnalysisSummary | None
    options: list[OptionOut]
    chosen_option_id: uuid.UUID | None
    result: ResultOut | None = None
    credits_left: int
