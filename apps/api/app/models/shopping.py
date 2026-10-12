from sqlalchemy import Boolean, String, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.mixins import OwnedMixin, TimestampMixin, UuidPrimaryKeyMixin

NAME_MAX_LENGTH = 200
QUANTITY_MAX_LENGTH = 50
NOTES_MAX_LENGTH = 1000


class ShoppingItem(UuidPrimaryKeyMixin, TimestampMixin, OwnedMixin, Base):
    """An item on the owner's shopping list. Each owner has exactly one list, so items
    belong to the owner directly."""

    __tablename__ = "shopping_items"

    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH))
    # Free text ("2", "500 g", "a dozen"), not a number with a unit.
    quantity: Mapped[str | None] = mapped_column(String(QUANTITY_MAX_LENGTH))
    notes: Mapped[str | None] = mapped_column(String(NOTES_MAX_LENGTH))
    checked: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    def __repr__(self) -> str:
        return f"ShoppingItem(id={self.id!s})"
