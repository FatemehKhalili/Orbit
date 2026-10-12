"""login throttles and devices

Adds sign-in throttling (Phase 6, ADR 0010): `login_throttles`, one row of failed-attempt
state per bucket (a hash of an attempted email, a device, a client IP, or "global"), and
`login_devices`, browsers that signed in before (only a hash of each token). Additive
only: no existing table changes, and neither table holds module data, so the downgrade
loses nothing but throttle state and known devices.

Revision ID: 73cc32af0338
Revises: 557fe5523984
Create Date: 2026-10-11 17:26:07.257287
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "73cc32af0338"
down_revision: str | None = "557fe5523984"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "login_throttles",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("failures", sa.Integer(), nullable=False),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("blocked_until", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_login_throttles")),
    )

    op.create_table(
        "login_devices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_login_devices_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_login_devices")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_login_devices_token_hash")),
    )
    op.create_index(op.f("ix_login_devices_user_id"), "login_devices", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_login_devices_user_id"), table_name="login_devices")
    op.drop_table("login_devices")
    op.drop_table("login_throttles")
