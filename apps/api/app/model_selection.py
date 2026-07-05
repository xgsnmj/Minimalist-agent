from fastapi import HTTPException, status

from apps.api.app.agents import Agent
from apps.api.app.model_configurations import (
    ModelConfiguration,
    model_configuration_store,
)


def effective_allowed_model_ids(agent: Agent) -> set[int]:
    allowed_model_ids = set(agent.allowed_model_configuration_ids)
    if agent.default_model_configuration_id is not None:
        allowed_model_ids.add(agent.default_model_configuration_id)
    return allowed_model_ids


def enabled_model_configurations_for_agent(agent: Agent) -> list[ModelConfiguration]:
    allowed_model_ids = effective_allowed_model_ids(agent)
    return [
        configuration
        for configuration in model_configuration_store.list_configurations()
        if configuration.enabled and configuration.id in allowed_model_ids
    ]


def resolve_agent_model_configuration_id(
    *,
    agent: Agent,
    selected_model_configuration_id: int | None,
) -> int:
    resolved_model_configuration_id = (
        selected_model_configuration_id
        if selected_model_configuration_id is not None
        else agent.default_model_configuration_id
    )
    if resolved_model_configuration_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Agent does not have a default Model Configuration.",
        )

    if resolved_model_configuration_id not in effective_allowed_model_ids(agent):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Model Configuration is not allowed for this Agent.",
        )

    configuration = model_configuration_store.get(resolved_model_configuration_id)
    if not configuration.enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Model Configuration is disabled.",
        )
    return configuration.id

