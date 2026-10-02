"""baseline

Empty starting point of the migration chain: creates no tables. The first product
module adds its tables in a revision on top of this one.

Revision ID: a79fa8454c44
Revises:
Create Date: 2026-10-02 14:13:20.801140
"""

from collections.abc import Sequence

revision: str = "a79fa8454c44"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
