from fastapi import APIRouter
from sqlalchemy import select

from ..db.models import Species, Style
from ..schemas import SpeciesOut, StyleOut
from ..security import DB

router = APIRouter(tags=["catalog"])


@router.get("/species", response_model=list[SpeciesOut])
def list_species(db: DB):
    return db.execute(select(Species).order_by(Species.name_vi)).scalars().all()


@router.get("/styles", response_model=list[StyleOut])
def list_styles(db: DB):
    return db.execute(select(Style)).scalars().all()
