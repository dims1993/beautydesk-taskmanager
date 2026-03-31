"""add organization_id to appointment

Revision ID: 20260331_0001
Revises: 
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa


revision = "20260331_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Column may already exist (manual patch); keep this idempotent.
    with op.batch_alter_table("appointment") as batch_op:
        batch_op.add_column(sa.Column("organization_id", sa.Integer(), nullable=True))
        batch_op.create_index(
            "ix_appointment_organization_id",
            ["organization_id"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("appointment") as batch_op:
        batch_op.drop_index("ix_appointment_organization_id")
        batch_op.drop_column("organization_id")

