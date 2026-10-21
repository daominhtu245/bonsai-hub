from fastapi import APIRouter

from ..schemas import UserOut
from ..security import CurrentUser

router = APIRouter(tags=["me"])


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user
