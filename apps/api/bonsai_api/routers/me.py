from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..schemas import UserOut
from ..security import DB, CurrentUser

router = APIRouter(tags=["me"])


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    garden_name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=32, pattern=r"^[0-9 +().-]{8,32}$")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileIn, user: CurrentUser, db: DB):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value.strip() if isinstance(value, str) and value.strip() else None)
    db.commit()
    return user
