"""Schema JSON đầu ra của các bước AI (Pydantic). Bước sau chỉ đọc JSON của bước trước."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Point = Annotated[list[float], Field(min_length=2, max_length=2)]
SpeciesKey = Literal["si", "sanh", "mai_chieu_thuy", "tung_la_han", "linh_sam", "other"]


class _Model(BaseModel):
    model_config = ConfigDict(extra="ignore")


# ---------- P1 Analyze ----------


class ImageQuality(_Model):
    usable: bool
    issues: list[str] = []


class SpeciesGuess(_Model):
    guess: SpeciesKey
    confidence: float = Field(ge=0, le=1)


class Trunk(_Model):
    base_point_px: Point
    apex_point_px: Point
    height_px: int = Field(gt=0)
    base_diameter_px: int = Field(gt=0)
    taper: Literal["good", "weak", "reverse", "uncertain"]
    movement: Literal["straight", "gentle_curve", "s_curve", "strong_twist", "leaning", "uncertain"]
    lean_angle_deg: float = 0
    notable: list[str] = []


class Nebari(_Model):
    quality: Literal["good", "average", "poor", "hidden", "uncertain"]
    spread_side: Literal["left", "right", "even", "unknown"]


class Branch(_Model):
    id: str
    start_px: Point
    end_px: Point | None = None
    direction: Literal["left", "right", "back", "front", "up"]
    thickness: Literal["thick", "medium", "thin"]
    height_ratio: float = Field(ge=0, le=1)
    issues: list[str] = []


class Analysis(_Model):
    image_quality: ImageQuality
    species: SpeciesGuess | None = None
    trunk: Trunk | None = None
    nebari: Nebari | None = None
    branches: list[Branch] = []
    best_front_view_index: int = 0
    summary_vi: str = ""

    @model_validator(mode="after")
    def _usable_needs_structure(self) -> Analysis:
        if self.image_quality.usable and (self.trunk is None or self.species is None or self.nebari is None):
            raise ValueError("usable=true requires species, trunk and nebari")
        ids = [b.id for b in self.branches]
        if len(ids) != len(set(ids)):
            raise ValueError("branch ids must be unique")
        return self


# ---------- P2 Design ----------


class Apex(_Model):
    point_px: Point
    lean: Literal["slightly_left", "slightly_right", "forward"]


class KeepBranch(_Model):
    id: str
    role: Literal["first_branch", "second_branch", "third_branch", "back_branch", "apex", "other"]


class RemoveBranch(_Model):
    id: str
    reason_vi: str


class NewBranch(_Model):
    at_px: Point
    direction: Literal["left", "right", "back", "front", "up"]
    note_vi: str


class Silhouette(_Model):
    width_px: int = Field(gt=0)
    height_px: int = Field(gt=0)
    pads: int = Field(ge=1, le=12)


class Pot(_Model):
    shape: Literal["rectangle", "oval", "round", "cascade_deep"]
    color: str
    position: Literal["off_center_left", "off_center_right", "center"]


class DesignOption(_Model):
    style_key: str
    suitability: float = Field(ge=0, le=1)
    why_vi: str
    front: str = ""
    apex: Apex
    keep_branches: list[KeepBranch]
    remove_branches: list[RemoveBranch]
    new_branches_needed: list[NewBranch] = []
    silhouette: Silhouette
    pot: Pot
    care_steps_vi: list[str] = []


class DesignResult(_Model):
    options: list[DesignOption] = Field(min_length=2, max_length=3)
