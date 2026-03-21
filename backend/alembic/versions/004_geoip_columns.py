"""Add latitude and longitude to iocs for GeoIP caching.

Revision ID: 004_geoip_columns
Revises: 003_threat_actors
Create Date: 2026-03-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_geoip_columns"
down_revision: Union[str, None] = "003_threat_actors"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("iocs", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("iocs", sa.Column("longitude", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("iocs", "longitude")
    op.drop_column("iocs", "latitude")
