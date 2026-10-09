"""The Shopping module: one shopping list per owner (ADR 0007).

Every query below filters on the signed-in user's `owner_id` in SQL. An item that
belongs to someone else is "not found", exactly like one that does not exist.
"""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator
from sqlalchemy import delete, select

from app.auth.dependencies import CurrentUserDep
from app.database import SessionDep
from app.models import ShoppingItem, User
from app.models.shopping import NAME_MAX_LENGTH, NOTES_MAX_LENGTH, QUANTITY_MAX_LENGTH

router = APIRouter(prefix="/shopping", tags=["shopping"])

Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=NAME_MAX_LENGTH)
]
Quantity = Annotated[str, StringConstraints(strip_whitespace=True, max_length=QUANTITY_MAX_LENGTH)]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=NOTES_MAX_LENGTH)]

NOT_FOUND = "Shopping item not found"


class _ItemInput(BaseModel):
    # Unknown fields (owner_id, id, timestamps) are refused, not ignored.
    model_config = ConfigDict(extra="forbid")

    quantity: Quantity | None = None
    notes: Notes | None = None

    @field_validator("quantity", "notes")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        return value or None


class ShoppingItemCreate(_ItemInput):
    name: Name


class ShoppingItemUpdate(_ItemInput):
    """Partial update: a field left out stays as it is; `null` clears quantity or notes."""

    name: Name | None = None
    checked: bool | None = None

    @field_validator("name", "checked")
    @classmethod
    def _not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("may be left out, but not null")
        return value


class ShoppingItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    quantity: str | None
    notes: str | None
    checked: bool
    created_at: datetime
    updated_at: datetime


def _owned_items(user: User):
    return select(ShoppingItem).where(ShoppingItem.owner_id == user.id)


def _get_owned_item(session: SessionDep, user: User, item_id: uuid.UUID) -> ShoppingItem:
    item = session.scalar(_owned_items(user).where(ShoppingItem.id == item_id))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return item


ITEM_RESPONSES = {404: {"description": NOT_FOUND}}


@router.get("/items")
def list_items(user: CurrentUserDep, session: SessionDep) -> list[ShoppingItemOut]:
    """The owner's items: unchecked first, then in the order they were added."""
    items = session.scalars(
        _owned_items(user).order_by(ShoppingItem.checked, ShoppingItem.created_at, ShoppingItem.id)
    )
    return [ShoppingItemOut.model_validate(item) for item in items]


@router.post("/items", status_code=status.HTTP_201_CREATED)
def create_item(
    body: ShoppingItemCreate, user: CurrentUserDep, session: SessionDep
) -> ShoppingItemOut:
    item = ShoppingItem(owner_id=user.id, **body.model_dump())
    session.add(item)
    session.commit()
    session.refresh(item)
    return ShoppingItemOut.model_validate(item)


@router.get("/items/{item_id}", responses=ITEM_RESPONSES)
def get_item(item_id: uuid.UUID, user: CurrentUserDep, session: SessionDep) -> ShoppingItemOut:
    return ShoppingItemOut.model_validate(_get_owned_item(session, user, item_id))


@router.patch("/items/{item_id}", responses=ITEM_RESPONSES)
def update_item(
    item_id: uuid.UUID, body: ShoppingItemUpdate, user: CurrentUserDep, session: SessionDep
) -> ShoppingItemOut:
    item = _get_owned_item(session, user, item_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    session.commit()
    session.refresh(item)
    return ShoppingItemOut.model_validate(item)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT, responses=ITEM_RESPONSES)
def delete_item(item_id: uuid.UUID, user: CurrentUserDep, session: SessionDep) -> Response:
    result = session.execute(
        delete(ShoppingItem).where(ShoppingItem.owner_id == user.id, ShoppingItem.id == item_id)
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
