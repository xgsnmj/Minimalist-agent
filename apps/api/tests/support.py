from apps.api.app.agents import AgentUpdateRequest, agent_store
from apps.api.app.model_configurations import (
    ModelConfigurationMutationRequest,
    model_configuration_store,
)
from apps.api.app.runtime import runtime_store


def create_model_configuration_for_tests(
    *,
    provider_id: str = "openai",
    model_name: str = "gpt-5",
    enabled: bool = True,
) -> int:
    configuration = model_configuration_store.create(
        ModelConfigurationMutationRequest(
            provider_id=provider_id,
            name=f"{provider_id}:{model_name}",
            model_name=model_name,
            endpoint="https://api.openai.com/v1",
            credential_reference="env:TEST_MODEL_API_KEY",
            enabled=enabled,
        )
    )
    return configuration.id


def configure_default_agent_model(
    *,
    agent_id: int = 1,
    provider_id: str = "openai",
    model_name: str = "gpt-5",
    enabled: bool = True,
) -> int:
    configuration_id = create_model_configuration_for_tests(
        provider_id=provider_id,
        model_name=model_name,
        enabled=enabled,
    )
    agent_store.update(
        agent_id,
        AgentUpdateRequest(
            default_model_configuration_id=configuration_id,
            allowed_model_configuration_ids=[configuration_id],
        ),
    )
    return configuration_id


def use_fake_agent_runtime() -> None:
    runtime_store.use_fake_model_provider_for_tests()
