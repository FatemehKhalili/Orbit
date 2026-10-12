"""shopping items

Adds the Shopping module's items (`shopping_items`). Each owner has one list, so items
belong to the owner directly through `owner_id` (cascade on delete).

Revision ID: fa85c3680a05
Revises: 523733546fba
Create Date: 2026-10-03 10:40:04.490766
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "fa85c3680a05"
down_revision: str | None = "523733546fba"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "shopping_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("quantity", sa.String(length=50), nullable=True),
        sa.Column("notes", sa.String(length=1000), nullable=True),
        sa.Column("checked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name=op.f("fk_shopping_items_owner_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_shopping_items")),
    )
    op.create_index(
        op.f("ix_shopping_items_owner_id"), "shopping_items", ["owner_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_shopping_items_owner_id"), table_name="shopping_items")
    op.drop_table("shopping_items")
