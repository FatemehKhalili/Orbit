"""habits

Adds the Habits module (Phase 5): `habits`, active while `archived_at` is null, and
`habit_check_ins`, one row per habit per calendar day it was done (ADR 0008). A composite
foreign key keeps a check-in's owner equal to its habit's owner, and deleting a habit (or
its owner) deletes its check-ins. Additive only: no existing table changes.

Revision ID: 557fe5523984
Revises: fa85c3680a05
Create Date: 2026-10-11 12:16:33.093495
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "557fe5523984"
down_revision: str | None = "fa85c3680a05"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            name,
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        )
        for name in ("created_at", "updated_at")
    ]


def upgrade() -> None:
    op.create_table(
        "habits",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("notes", sa.String(length=1000), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_habits_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_habits")),
        sa.UniqueConstraint("id", "owner_id", name="uq_habits_id_owner_id"),
    )
    op.create_index(op.f("ix_habits_owner_id"), "habits", ["owner_id"], unique=False)

    op.create_table(
        "habit_check_ins",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("habit_id", sa.Uuid(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["habit_id", "owner_id"],
            ["habits.id", "habits.owner_id"],
            name="fk_habit_check_ins_habit_id_owner_id_habits",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name=op.f("fk_habit_check_ins_owner_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_habit_check_ins")),
        sa.UniqueConstraint("habit_id", "day", name="uq_habit_check_ins_habit_id_day"),
    )
    op.create_index(
        op.f("ix_habit_check_ins_owner_id"), "habit_check_ins", ["owner_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_habit_check_ins_owner_id"), table_name="habit_check_ins")
    op.drop_table("habit_check_ins")
    op.drop_index(op.f("ix_habits_owner_id"), table_name="habits")
    op.drop_table("habits")
