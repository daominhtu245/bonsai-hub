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
