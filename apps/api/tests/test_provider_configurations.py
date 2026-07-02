from dataclasses import dataclass

import pytest
from fastapi import HTTPException
from pydantic import BaseModel

from apps.api.app.provider_configurations import ProviderConfigurationStore


@dataclass
class DemoProviderConfiguration:
    id: int
    name: str
    endpoint: str
    max_results: int
    enabled: bool = True


class DemoProviderUpdateRequest(BaseModel):
    name: str | None = None
    endpoint: str | None = None
    max_results: int | None = None
    enabled: bool | None = None


def test_provider_configuration_store_owns_common_lifecycle_rules():
    disabled = DemoProviderConfiguration(
        id=2,
        name="Disabled",
        endpoint="https://disabled.example",
        max_results=1,
        enabled=False,
    )
    active = DemoProviderConfiguration(
        id=1,
        name="Active",
        endpoint="https://active.example",
        max_results=5,
        enabled=True,
    )
    store = ProviderConfigurationStore(
        configurations={2: disabled, 1: active},
        not_found_detail="Demo Provider Configuration not found.",
        disabled_detail="Demo provider is disabled.",
    )

    updated = store.update(
        1,
        DemoProviderUpdateRequest(name="Updated", max_results=3),
        fields=("name", "endpoint", "max_results", "enabled"),
    )
    active.enabled = False

    assert [configuration.id for configuration in store.list_configurations()] == [1, 2]
    assert updated.name == "Updated"
    assert updated.endpoint == "https://active.example"
    assert updated.max_results == 3
    assert store.get_provenance_configuration().id == 1
    with pytest.raises(HTTPException) as exc_info:
        store.get_active_configuration()
    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Demo provider is disabled."
