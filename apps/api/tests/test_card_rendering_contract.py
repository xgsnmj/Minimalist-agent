import re
from pathlib import Path

from apps.api.app.card_schema_registry import REGISTERED_CARD_SCHEMA_VALUES


def test_backend_card_schema_registry_matches_frontend_rendering_contract():
    contract_path = (
        Path(__file__).parents[3]
        / "apps"
        / "web"
        / "src"
        / "shared"
        / "card-schema-contract.ts"
    )
    contract_source = contract_path.read_text()
    frontend_schemas = set(
        re.findall(r'"([a-z_]+_card)"', contract_source.split("] as const", 1)[0])
    )

    assert frontend_schemas == set(REGISTERED_CARD_SCHEMA_VALUES)
