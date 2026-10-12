"""calendar events

Adds the Calendar module (Phase 8, ADR 0011): `calendar_events`, each either all day on a
span of days (`start_day` to `end_day`, inclusive) or timed between two instants
(`starts_at`, `ends_at`). Two check constraints keep the shapes apart and the end on or
after the start. Additive only: no existing table or row changes. The downgrade drops the
table and its events; on real data, roll back by restoring a backup instead
(docs/releasing.md).

Revision ID: b3d81c5e0f27
Revises: 73cc32af0338
Create Date: 2026-10-12 19:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b3d81c5e0f27"
down_revision: str | None = "73cc32af0338"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Copied from app/models/calendar.py, so this migration never changes when the model does.
SHAPE = (
    "(all_day AND start_day IS NOT NULL AND end_day IS NOT NULL"
    " AND starts_at IS NULL AND ends_at IS NULL)"
    " OR (NOT all_day AND starts_at IS NOT NULL AND ends_at IS NOT NULL"
    " AND start_day IS NULL AND end_day IS NULL)"
)
END_NOT_BEFORE_START = (
    "(all_day AND end_day >= start_day) OR (NOT all_day AND ends_at >= starts_at)"
)


def upgrade() -> None:
    op.create_table(
        "calendar_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("notes", sa.String(length=8000), nullable=True),
        sa.Column("all_day", sa.Boolean(), nullable=False),
        sa.Column("start_day", sa.Date(), nullable=True),
        sa.Column("end_day", sa.Date(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        *(
            sa.Column(
                name, sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
            )
            for name in ("created_at", "updated_at")
        ),
        sa.CheckConstraint(SHAPE, name=op.f("ck_calendar_events_shape")),
        sa.CheckConstraint(
            END_NOT_BEFORE_START, name=op.f("ck_calendar_events_end_not_before_start")
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name=op.f("fk_calendar_events_owner_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_calendar_events")),
    )
    op.create_index(
        op.f("ix_calendar_events_owner_id"), "calendar_events", ["owner_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_calendar_events_owner_id"), table_name="calendar_events")
    op.drop_table("calendar_events")
