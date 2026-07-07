import asyncio
import json

from apps.api.app.agent_run_lifecycle import agent_run_lifecycle
from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import AgentUpdateRequest, agent_store
from apps.api.app.model_configurations import (
    ModelConfigurationMutationRequest,
    model_configuration_store,
)
from apps.api.app.runtime import runtime_store
from apps.api.app.runtime_tools import public_tool_name_for_sdk_name, sdk_tools_for_run


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
            model_settings={},
            native_tool_settings={},
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


def invoke_sdk_tool_for_tests(
    *,
    run_id: int,
    tool_name: str,
    payload: dict,
    call_id: str = "test-tool-call",
) -> dict:
    run = agent_run_store.get(run_id)
    tool = next(
        (
            candidate
            for candidate in sdk_tools_for_run(run, prefer_native=False)
            if public_tool_name_for_sdk_name(candidate.name) == tool_name
        ),
        None,
    )
    if tool is None:
        raise AssertionError(f"SDK tool {tool_name} is not registered for run {run_id}.")

    raw_output = asyncio.run(tool.on_invoke_tool(None, json.dumps(payload)))
    tool_call = json.loads(raw_output)
    tool_call["id"] = call_id
    agent_run_lifecycle.record_tool_call(run, tool_call=tool_call)
    return tool_call
