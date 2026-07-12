from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from enum import StrEnum
import json
import os
import re
import time
from typing import Any, Literal
from urllib.parse import urlparse

from agents import Agent, Model, ModelProvider, ModelSettings, ModelTracing, OpenAIProvider, Runner, RunConfig
from agents.items import ModelResponse, MessageOutputItem, ReasoningItem, ToolCallItem
from agents.sandbox import SandboxAgent, SandboxRunConfig
from agents.sandbox.capabilities import Capability, Shell
from agents.sandbox.capabilities.tools import ViewImageTool
from agents.sandbox.config import DEFAULT_PYTHON_SANDBOX_IMAGE
from agents.sandbox.sandboxes import UnixLocalSandboxClient
from agents.tracing import flush_traces, set_trace_processors
from agents.tracing.processor_interface import TracingProcessor as TracingProcessorProtocol
from agents.tracing.traces import Trace
from agents.usage import Usage
from openai.types.responses import (
    Response,
    ResponseCompletedEvent,
    ResponseOutputMessage,
    ResponseOutputText,
    ResponseTextDeltaEvent,
    ResponseTextDoneEvent,
)

from apps.api.app.agent_run_execution import agent_run_execution
from apps.api.app.agent_runs import AgentRunStatus, agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.conversations import conversation_store
from apps.api.app.model_configurations import ModelConfiguration, model_configuration_store
from apps.api.app.runtime_tools import (
    capability_for_tool_name,
    project_safe_payload,
    public_tool_name_for_sdk_name,
    sdk_tools_for_run,
    tools_require_openai_responses,
)
from apps.api.app.secret_vault import secret_vault_store

_MODEL_PARAMETER_KEY_MAP = {
    "temperature": "temperature",
    "top_p": "top_p",
    "frequency_penalty": "frequency_penalty",
    "presence_penalty": "presence_penalty",
    "tool_choice": "tool_choice",
    "parallel_tool_calls": "parallel_tool_calls",
    "truncation": "truncation",
    "max_tokens": "max_tokens",
    "max_output_tokens": "max_tokens",
    "reasoning": "reasoning",
    "verbosity": "verbosity",
    "store": "store",
    "response_include": "response_include",
    "top_logprobs": "top_logprobs",
    "extra_query": "extra_query",
    "extra_body": "extra_body",
    "extra_headers": "extra_headers",
    "extra_args": "extra_args",
    "metadata": "metadata",
    "prompt_cache_retention": "prompt_cache_retention",
    "include_usage": "include_usage",
}

_OPENAI_COMPATIBLE_PROVIDER_IDS = {
    "bytedance-doubao",
    "custom-openai-compatible",
    "deepseek",
    "moonshot-kimi",
    "openai",
    "openrouter",
    "qwen-dashscope",
    "zhipu-glm",
}

_RESPONSES_COMPATIBLE_ENDPOINT_ENV_KEYS = (
    "OPENAI_RESPONSES_COMPATIBLE_ENDPOINTS",
    "OPENAI_RESPONSES_COMPATIBLE_BASE_URLS",
)
_SANDBOX_PROFILE_ALIASES = {
    "default": "responses_full",
    "full": "responses_full",
    "responses": "responses_full",
    "responses_full": "responses_full",
    "openai_responses": "responses_full",
    "openai_responses_full": "responses_full",
    "chat": "chat_functions",
    "chat_completions": "chat_functions",
    "chat_function": "chat_functions",
    "chat_functions": "chat_functions",
    "chat_shell": "chat_functions",
    "chat_shell_only": "chat_functions",
    "shell": "chat_functions",
    "shell_only": "chat_functions",
}


class SandboxCapabilityProfile(StrEnum):
    RESPONSES_FULL = "responses_full"
    CHAT_FUNCTIONS = "chat_functions"


class SandboxRuntimeType(StrEnum):
    LOCAL = "local"
    DOCKER = "docker"


_SANDBOX_RUNTIME_ALIASES = {
    "local": SandboxRuntimeType.LOCAL,
    "unix": SandboxRuntimeType.LOCAL,
    "unix_local": SandboxRuntimeType.LOCAL,
    "docker": SandboxRuntimeType.DOCKER,
}


class _ChatCompatibleFilesystem(Capability):
    type: Literal["filesystem"] = "filesystem"

    def tools(self) -> list[Any]:
        if self.session is None:
            raise ValueError("Filesystem capability is not bound to a SandboxSession")
        return [ViewImageTool(session=self.session, user=self.run_as)]


@dataclass
class RuntimeResult:
    status: str
    model_name: str
    agent_instruction_snapshot: str
    process_summaries: list[str] = field(default_factory=list)
    full_trace: dict[str, object] = field(default_factory=dict)


class _CapturedTraceProcessor(TracingProcessorProtocol):
    def __init__(self) -> None:
        self.trace: dict[str, object] | None = None

    def on_trace_start(self, trace: Trace) -> None:
        self.trace = trace.to_json(include_tracing_api_key=False)

    def on_trace_end(self, trace: Trace) -> None:
        self.trace = trace.to_json(include_tracing_api_key=False)

    def on_span_start(self, span) -> None:
        return None

    def on_span_end(self, span) -> None:
        return None

    def shutdown(self) -> None:
        return None

    def force_flush(self) -> None:
        return None


class _LocalModel(Model):
    def __init__(self, model_name: str, provider_id: str) -> None:
        self.model_name = model_name
        self.provider_id = provider_id

    async def get_response(
        self,
        system_instructions: str | None,
        input: str | list[Any],
        model_settings: ModelSettings,
        tools: list[Any],
        output_schema: Any,
        handoffs: list[Any],
        tracing: ModelTracing,
        *,
        previous_response_id: str | None,
        conversation_id: str | None,
        prompt: Any,
    ) -> ModelResponse:
        user_message = _last_user_text(input)
        assistant_text = f"{self.provider_id}:{self.model_name} handled {user_message}"
        output = ResponseOutputMessage(
            id=f"response-{self.model_name}",
            content=[
                ResponseOutputText(
                    annotations=[],
                    text=assistant_text,
                    type="output_text",
                )
            ],
            role="assistant",
            status="completed",
            type="message",
        )
        return ModelResponse(
            output=[output],
            usage=Usage(requests=1, input_tokens=1, output_tokens=1, total_tokens=2),
            response_id=f"response-{self.model_name}",
        )

    async def stream_response(
        self,
        system_instructions: str | None,
        input: str | list[Any],
        model_settings: ModelSettings,
        tools: list[Any],
        output_schema: Any,
        handoffs: list[Any],
        tracing: ModelTracing,
        *,
        previous_response_id: str | None,
        conversation_id: str | None,
        prompt: Any,
    ) -> AsyncIterator[Any]:
        user_message = _last_user_text(input)
        assistant_text = f"{self.provider_id}:{self.model_name} handled {user_message}"
        chunks = _stream_text_chunks(assistant_text)
        output = ResponseOutputMessage(
            id=f"response-{self.model_name}",
            content=[
                ResponseOutputText(
                    annotations=[],
                    text=assistant_text,
                    type="output_text",
                )
            ],
            role="assistant",
            status="completed",
            type="message",
        )
        sequence_number = 1
        for chunk in chunks:
            yield ResponseTextDeltaEvent(
                content_index=0,
                delta=chunk,
                item_id=output.id,
                output_index=0,
                sequence_number=sequence_number,
                type="response.output_text.delta",
                logprobs=[],
            )
            sequence_number += 1
        yield ResponseTextDoneEvent(
            content_index=0,
            item_id=output.id,
            output_index=0,
            sequence_number=sequence_number,
            text=assistant_text,
            type="response.output_text.done",
            logprobs=[],
        )
        sequence_number += 1
        yield ResponseCompletedEvent(
            response=Response(
                id=f"response-{self.model_name}",
                created_at=time.time(),
                model=self.model_name,
                object="response",
                output=[output],
                parallel_tool_calls=False,
                tool_choice="auto",
                tools=[],
                status="completed",
            ),
            sequence_number=sequence_number,
            type="response.completed",
        )


class _LocalModelProvider(ModelProvider):
    def __init__(self, provider_id: str, model_name: str) -> None:
        self.provider_id = provider_id
        self.model_name = model_name

    def get_model(self, model_name: str | None) -> Model:
        return _LocalModel(model_name or self.model_name, self.provider_id)


class RuntimeStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self._model_provider_factory = None

    def set_model_provider_factory_for_tests(self, factory) -> None:
        self._model_provider_factory = factory

    def use_fake_model_provider_for_tests(self) -> None:
        self._model_provider_factory = lambda configuration: _LocalModelProvider(
            provider_id=configuration.provider_id,
            model_name=configuration.model_name,
        )

    def execute(self, run_id: int) -> dict[str, object]:
        run = agent_run_store.get(run_id)
        if run.status in {AgentRunStatus.CANCELLED, AgentRunStatus.COMPLETED, AgentRunStatus.FAILED}:
            return self._runtime_result_from_run(run, full_trace=_trace_fallback(run))

        if "failure" in run.user_message.lower():
            agent_run_execution.apply_runtime_failure(
                run_id=run.id,
                message="Mock Agent Runtime failed.",
            )
            failed_run = agent_run_store.get(run.id)
            return self._runtime_result_from_run(failed_run, full_trace=_trace_fallback(failed_run))

        try:
            model_configuration = _resolve_model_configuration(
                run.capability_snapshot.selected_model_configuration_id
            )
        except Exception as exc:
            agent_run_execution.apply_runtime_failure(
                run_id=run.id,
                message=_error_message(exc),
            )
            failed_run = agent_run_store.get(run.id)
            return self._runtime_result_from_run(failed_run, full_trace=_trace_fallback(failed_run))
        agent = agent_store.get(run.capability_snapshot.agent_id)
        provider_id = model_configuration.provider_id
        model_name = model_configuration.model_name
        try:
            runtime_tools = sdk_tools_for_run(run)
            sandbox_profile = _sandbox_capability_profile_for_configuration(
                model_configuration,
                runtime_tools=runtime_tools,
            )
            use_responses = _use_openai_responses_for_configuration(
                model_configuration,
                runtime_tools=runtime_tools,
            )
            model_provider = self._model_provider(
                model_configuration,
                use_responses=use_responses,
            )
            model_settings = _model_settings_for_configuration(model_configuration)
            sandbox_run_config = _sandbox_run_config_for_configuration(model_configuration)
            sandbox_runtime_type = _sandbox_runtime_type_for_configuration(model_configuration)
            runner_input = _runner_input_for_run(run)
        except Exception as exc:
            agent_run_execution.apply_runtime_failure(
                run_id=run.id,
                message=_error_message(exc),
            )
            failed_run = agent_run_store.get(run.id)
            return self._runtime_result_from_run(failed_run, full_trace=_trace_fallback(failed_run))

        trace_processor = _CapturedTraceProcessor()
        set_trace_processors([trace_processor])

        agent_run_execution.begin_runtime_execution(run.id)

        runtime_agent = _runtime_agent(
            agent=agent,
            model_name=model_name,
            runtime_tools=runtime_tools,
            run=run,
            sandbox_profile=sandbox_profile,
        )
        run_config = RunConfig(
            model_provider=model_provider,
            model_settings=model_settings,
            sandbox=sandbox_run_config,
            workflow_name="Agent workflow",
            trace_include_sensitive_data=False,
            trace_metadata={
                "agent_id": str(agent.id),
                "run_id": str(run.id),
                "conversation_id": str(run.conversation_id),
                "model_configuration_id": str(model_configuration.id),
                "provider_id": provider_id,
                "model_name": model_name,
                "endpoint": model_configuration.endpoint,
                "sandbox_capability_profile": sandbox_profile.value,
                "sandbox_runtime_type": sandbox_runtime_type.value,
                "max_turns": str(run.capability_snapshot.sdk_settings.max_turns),
                "tool_use_behavior": run.capability_snapshot.sdk_settings.tool_use_behavior.value,
            },
        )

        try:
            result = Runner.run_sync(
                runtime_agent,
                runner_input,
                max_turns=run.capability_snapshot.sdk_settings.max_turns,
                run_config=run_config,
            )
        except Exception as exc:
            agent_run_execution.apply_runtime_failure(
                run_id=run.id,
                message=_error_message(exc),
            )
            set_trace_processors([])
            flush_traces()
            failed_run = agent_run_store.get(run.id)
            return self._runtime_result_from_run(failed_run, full_trace=_trace_fallback(failed_run))

        assistant_message = _extract_final_output(result.final_output)
        process_summaries = [
            f"Reviewed the Agent Instruction snapshot for conversation {run.conversation_id}.",
            f"Used model {model_name} from {provider_id}.",
        ]
        trace = trace_processor.trace or _trace_fallback(run)
        trace.setdefault("workflow_name", "Agent workflow")
        trace.setdefault("metadata", {})
        trace["run_id"] = run.id
        trace["agent_id"] = agent.id
        trace["model_configuration_id"] = model_configuration.id
        trace["model_configuration_snapshot"] = _model_configuration_snapshot(model_configuration)
        trace["agent_sdk_settings"] = run.capability_snapshot.sdk_settings.model_dump(mode="json")
        trace["provider_id"] = provider_id
        trace["model_name"] = model_name
        trace["endpoint"] = model_configuration.endpoint
        trace["sandbox_capability_profile"] = sandbox_profile.value
        trace["sandbox_runtime_type"] = sandbox_runtime_type.value
        agent_run_execution.apply_runtime_success(
            run_id=run.id,
            assistant_message=assistant_message,
            process_summaries=process_summaries,
            full_trace=trace,
        )
        set_trace_processors([])
        flush_traces()
        completed_run = agent_run_store.get(run.id)
        return self._runtime_result_from_run(completed_run, model_name=model_name, full_trace=trace)

    async def stream_execute(self, run_id: int) -> AsyncIterator[dict[str, object]]:
        run = agent_run_store.get(run_id)
        if run.status in {AgentRunStatus.CANCELLED, AgentRunStatus.COMPLETED, AgentRunStatus.FAILED}:
            return

        if "failure" in run.user_message.lower():
            failed_run = agent_run_execution.apply_runtime_failure(
                run_id=run.id,
                message="Mock Agent Runtime failed.",
            )
            yield {
                "event_type": "run.error",
                "data": {
                    "status": failed_run.status.value,
                    "message": failed_run.error or "Agent Run failed.",
                },
            }
            return

        try:
            model_configuration = _resolve_model_configuration(
                run.capability_snapshot.selected_model_configuration_id
            )
        except Exception as exc:
            failed_run = agent_run_execution.apply_runtime_failure(
                run_id=run.id,
                message=_error_message(exc),
            )
            yield {
                "event_type": "run.error",
                "data": {
                    "status": failed_run.status.value,
                    "message": failed_run.error or "Agent Run failed.",
                },
            }
            return

        agent = agent_store.get(run.capability_snapshot.agent_id)
        provider_id = model_configuration.provider_id
        model_name = model_configuration.model_name
        try:
            runtime_tools = sdk_tools_for_run(run)
            sandbox_profile = _sandbox_capability_profile_for_configuration(
                model_configuration,
                runtime_tools=runtime_tools,
            )
            use_responses = _use_openai_responses_for_configuration(
                model_configuration,
                runtime_tools=runtime_tools,
            )
            model_provider = self._model_provider(
                model_configuration,
                use_responses=use_responses,
            )
            model_settings = _model_settings_for_configuration(model_configuration)
            sandbox_run_config = _sandbox_run_config_for_configuration(model_configuration)
            sandbox_runtime_type = _sandbox_runtime_type_for_configuration(model_configuration)
            runner_input = _runner_input_for_run(run)
        except Exception as exc:
            failed_run = agent_run_execution.apply_runtime_failure(
                run_id=run.id,
                message=_error_message(exc),
            )
            yield {
                "event_type": "run.error",
                "data": {
                    "status": failed_run.status.value,
                    "message": failed_run.error or "Agent Run failed.",
                },
            }
            return

        trace_processor = _CapturedTraceProcessor()
        set_trace_processors([trace_processor])
        running_run = agent_run_execution.begin_runtime_execution(run.id)
        yield {
            "event_type": "run.status",
            "data": {"status": running_run.status.value},
        }

        runtime_agent = _runtime_agent(
            agent=agent,
            model_name=model_name,
            runtime_tools=runtime_tools,
            run=run,
            sandbox_profile=sandbox_profile,
        )
        run_config = RunConfig(
            model_provider=model_provider,
            model_settings=model_settings,
            sandbox=sandbox_run_config,
            workflow_name="Agent workflow",
            trace_include_sensitive_data=False,
            trace_metadata={
                "agent_id": str(agent.id),
                "run_id": str(run.id),
                "conversation_id": str(run.conversation_id),
                "model_configuration_id": str(model_configuration.id),
                "provider_id": provider_id,
                "model_name": model_name,
                "endpoint": model_configuration.endpoint,
                "sandbox_capability_profile": sandbox_profile.value,
                "sandbox_runtime_type": sandbox_runtime_type.value,
                "max_turns": str(run.capability_snapshot.sdk_settings.max_turns),
                "tool_use_behavior": run.capability_snapshot.sdk_settings.tool_use_behavior.value,
            },
        )

        assistant_chunks: list[str] = []
        pending_tool_calls: dict[str, dict[str, object]] = {}
        try:
            result = Runner.run_streamed(
                runtime_agent,
                runner_input,
                max_turns=run.capability_snapshot.sdk_settings.max_turns,
                run_config=run_config,
            )
            async for event in result.stream_events():
                if event.type == "run_item_stream_event":
                    tool_events = _runtime_tool_events_from_run_item(
                        event,
                        conversation_id=run.conversation_id,
                        pending_tool_calls=pending_tool_calls,
                        run_id=run.id,
                    )
                    for tool_event in tool_events:
                        _record_runtime_tool_event(run_id=run.id, tool_event=tool_event)
                        yield tool_event
                    continue
                if event.type != "raw_response_event":
                    continue
                if event.data.type != "response.output_text.delta":
                    continue
                delta = event.data.delta
                if not delta:
                    continue
                assistant_chunks.append(delta)
                agent_run_execution.record_message_delta(running_run, delta=delta)
                yield {
                    "event_type": "message.delta",
                    "data": {"role": "assistant", "delta": delta},
                }
        except Exception as exc:
            failed_run = agent_run_execution.apply_runtime_failure(
                run_id=run.id,
                message=_error_message(exc),
            )
            yield {
                "event_type": "run.error",
                "data": {
                    "status": failed_run.status.value,
                    "message": failed_run.error or "Agent Run failed.",
                },
            }
            return
        finally:
            set_trace_processors([])
            flush_traces()

        assistant_message = (
            _extract_final_output(result.final_output)
            if result.final_output is not None
            else ""
        ) or "".join(assistant_chunks)
        process_summaries = [
            f"Reviewed the Agent Instruction snapshot for conversation {run.conversation_id}.",
            f"Used model {model_name} from {provider_id}.",
        ]
        trace = trace_processor.trace or _trace_fallback(run)
        trace.setdefault("workflow_name", "Agent workflow")
        trace.setdefault("metadata", {})
        trace["run_id"] = run.id
        trace["agent_id"] = agent.id
        trace["model_configuration_id"] = model_configuration.id
        trace["model_configuration_snapshot"] = _model_configuration_snapshot(model_configuration)
        trace["agent_sdk_settings"] = run.capability_snapshot.sdk_settings.model_dump(mode="json")
        trace["provider_id"] = provider_id
        trace["model_name"] = model_name
        trace["endpoint"] = model_configuration.endpoint
        trace["sandbox_capability_profile"] = sandbox_profile.value
        trace["sandbox_runtime_type"] = sandbox_runtime_type.value
        agent_run_execution.apply_runtime_success(
            run_id=run.id,
            assistant_message=assistant_message,
            process_summaries=process_summaries,
            full_trace=trace,
        )
        for summary in process_summaries:
            yield {
                "event_type": "process.summary",
                "data": {"summary": summary},
            }
        if assistant_message:
            yield {
                "event_type": "message.completed",
                "data": {"role": "assistant", "content": assistant_message},
            }
        yield {
            "event_type": "run.status",
            "data": {"status": AgentRunStatus.COMPLETED.value},
        }

    def _runtime_result_from_run(
        self,
        run,
        *,
        model_name: str | None = None,
        full_trace: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return {
            "id": run.id,
            "status": run.status.value,
            "model_name": model_name or _run_model_name(run),
            "agent_instruction_snapshot": run.capability_snapshot.agent_instruction_snapshot,
            "process_summaries": list(run.process_summaries),
            "full_trace": full_trace or _trace_fallback(run),
        }

    def _model_provider(
        self,
        configuration: ModelConfiguration,
        *,
        use_responses: bool = False,
    ) -> ModelProvider:
        if self._model_provider_factory is not None:
            return self._model_provider_factory(configuration)
        route = _model_provider_route(configuration)
        return OpenAIProvider(
            api_key=resolve_model_api_key(configuration.credential_reference),
            base_url=configuration.endpoint,
            use_responses=(route == "openai_responses" or use_responses),
        )


def _runtime_agent(
    *,
    agent: Any,
    model_name: str,
    runtime_tools: list[Any],
    run: Any,
    sandbox_profile: SandboxCapabilityProfile = SandboxCapabilityProfile.RESPONSES_FULL,
) -> SandboxAgent:
    agent_kwargs: dict[str, Any] = {
        "name": agent.name,
        "instructions": agent.instruction,
        "model": model_name,
        "tools": runtime_tools,
        "tool_use_behavior": run.capability_snapshot.sdk_settings.tool_use_behavior.value,
        "reset_tool_choice": run.capability_snapshot.sdk_settings.reset_tool_choice,
    }
    capabilities = _sandbox_capabilities_for_profile(sandbox_profile)
    if capabilities is not None:
        agent_kwargs["capabilities"] = capabilities
    return SandboxAgent(**agent_kwargs)


def _local_sandbox_run_config() -> SandboxRunConfig:
    return SandboxRunConfig(client=UnixLocalSandboxClient())


def _sandbox_run_config_for_configuration(
    configuration: ModelConfiguration,
) -> SandboxRunConfig:
    runtime_settings = _sandbox_runtime_settings_for_configuration(configuration)
    runtime_type = _coerce_sandbox_runtime_type(runtime_settings.get("type"))
    if runtime_type == SandboxRuntimeType.LOCAL:
        return _local_sandbox_run_config()
    if runtime_type == SandboxRuntimeType.DOCKER:
        return _docker_sandbox_run_config(runtime_settings)
    raise RuntimeError(f"Unsupported SandboxAgent runtime type: {runtime_type}")


def _sandbox_runtime_type_for_configuration(
    configuration: ModelConfiguration,
) -> SandboxRuntimeType:
    runtime_settings = _sandbox_runtime_settings_for_configuration(configuration)
    return _coerce_sandbox_runtime_type(runtime_settings.get("type"))


def _docker_sandbox_run_config(runtime_settings: dict[str, Any]) -> SandboxRunConfig:
    try:
        import docker
        from agents.sandbox.sandboxes import DockerSandboxClient, DockerSandboxClientOptions
    except Exception as exc:
        raise RuntimeError(
            "Docker sandbox runtime requires the docker SDK. "
            "Install the project dependencies with `uv sync`."
        ) from exc

    docker_host = _optional_text(
        runtime_settings.get("docker_host")
        or runtime_settings.get("host")
        or runtime_settings.get("base_url")
    )
    use_ssh_client = _optional_bool_value(runtime_settings.get("use_ssh_client"))
    docker_client_kwargs = _docker_client_kwargs(runtime_settings)
    if docker_host:
        docker_client_kwargs["base_url"] = docker_host
        if use_ssh_client is None:
            use_ssh_client = docker_host.startswith("ssh://")
        docker_client_kwargs["use_ssh_client"] = bool(use_ssh_client)
        docker_client = docker.DockerClient(**docker_client_kwargs)
    else:
        docker_host_from_env = os.getenv("DOCKER_HOST", "").strip()
        if use_ssh_client is None and docker_host_from_env.startswith("ssh://"):
            use_ssh_client = True
        if use_ssh_client is not None:
            docker_client_kwargs["use_ssh_client"] = use_ssh_client
        docker_client = docker.from_env(**docker_client_kwargs)

    image = (
        _optional_text(runtime_settings.get("image"))
        or os.getenv("SANDBOX_DOCKER_IMAGE", "").strip()
        or DEFAULT_PYTHON_SANDBOX_IMAGE
    )
    return SandboxRunConfig(
        client=DockerSandboxClient(docker_client),
        options=DockerSandboxClientOptions(
            image=image,
            exposed_ports=_port_tuple(runtime_settings.get("exposed_ports")),
        ),
    )


def _docker_client_kwargs(runtime_settings: dict[str, Any]) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    version = (
        _optional_text(runtime_settings.get("version"))
        or os.getenv("SANDBOX_DOCKER_API_VERSION", "").strip()
    )
    timeout = _optional_int_value(runtime_settings.get("timeout"))
    if version:
        kwargs["version"] = version
    if timeout is not None:
        kwargs["timeout"] = timeout
    return kwargs


def _sandbox_agent_settings(configuration: ModelConfiguration) -> dict[str, Any]:
    native_tool_settings = configuration.native_tool_settings
    if not isinstance(native_tool_settings, dict):
        return {}
    return (
        _record_from_mapping(native_tool_settings, "sandbox_agent")
        or _record_from_mapping(native_tool_settings, "sandbox")
        or {}
    )


def _sandbox_runtime_settings_for_configuration(
    configuration: ModelConfiguration,
) -> dict[str, Any]:
    sandbox_settings = _sandbox_agent_settings(configuration)
    runtime_settings = _record_from_mapping(sandbox_settings, "runtime")
    return runtime_settings or {}


def _coerce_sandbox_runtime_type(value: Any) -> SandboxRuntimeType:
    raw_value = "local" if value is None else str(value).strip().lower().replace("-", "_")
    runtime_type = _SANDBOX_RUNTIME_ALIASES.get(raw_value)
    if runtime_type is None:
        allowed = ", ".join(runtime.value for runtime in SandboxRuntimeType)
        raise RuntimeError(f"Unsupported SandboxAgent runtime type '{value}'. Use one of: {allowed}.")
    return runtime_type


def _port_tuple(value: Any) -> tuple[int, ...]:
    if value is None or value == "":
        return ()
    if isinstance(value, str):
        raw_items = [item.strip() for item in value.split(",")]
    elif isinstance(value, list | tuple | set):
        raw_items = list(value)
    else:
        raise RuntimeError("SandboxAgent Docker exposed_ports must be a list or comma-separated string.")

    ports: list[int] = []
    for item in raw_items:
        if item == "":
            continue
        try:
            port = int(item)
        except (TypeError, ValueError) as exc:
            raise RuntimeError(f"Invalid SandboxAgent Docker exposed port: {item!r}.") from exc
        if port < 1 or port > 65535:
            raise RuntimeError(f"SandboxAgent Docker exposed port is out of range: {port}.")
        ports.append(port)
    return tuple(ports)


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _optional_bool_value(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return None


def _optional_int_value(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"Expected integer value, got {value!r}.") from exc
    return parsed if parsed > 0 else None


def _resolve_model_configuration(configuration_id: int | None):
    if configuration_id is None:
        raise RuntimeError("Agent Run does not have a selected Model Configuration.")
    configuration = model_configuration_store.get(configuration_id)
    if not configuration.enabled:
        raise RuntimeError("Model Configuration is disabled.")
    return configuration


def _runner_input_for_run(run) -> str | list[dict[str, str]]:
    conversation = conversation_store.get_for_user(
        owner_user_id=run.owner_user_id,
        conversation_id=run.conversation_id,
    )
    messages: list[dict[str, str]] = []
    for message in conversation.messages:
        if message.role not in {"user", "assistant"}:
            continue
        if not message.content:
            continue
        messages.append({"role": message.role, "content": message.content})

    if (
        not messages
        or messages[-1]["role"] != "user"
        or messages[-1]["content"] != run.user_message
    ):
        messages.append({"role": "user", "content": run.user_message})
    return messages or run.user_message


def _sandbox_capability_profile_for_configuration(
    configuration: ModelConfiguration,
    *,
    runtime_tools: list[Any],
) -> SandboxCapabilityProfile:
    explicit_profile = _configured_sandbox_capability_profile(configuration)
    if explicit_profile is not None:
        return explicit_profile
    if _is_official_openai_configuration(configuration):
        return SandboxCapabilityProfile.RESPONSES_FULL
    if _is_configured_responses_compatible_endpoint(configuration.endpoint):
        return SandboxCapabilityProfile.RESPONSES_FULL
    if tools_require_openai_responses(runtime_tools):
        return SandboxCapabilityProfile.RESPONSES_FULL
    _model_provider_route(configuration)
    return SandboxCapabilityProfile.CHAT_FUNCTIONS


def _sandbox_capabilities_for_profile(
    profile: SandboxCapabilityProfile,
) -> list[Capability] | None:
    if profile == SandboxCapabilityProfile.RESPONSES_FULL:
        return None
    if profile == SandboxCapabilityProfile.CHAT_FUNCTIONS:
        return [_ChatCompatibleFilesystem(), Shell()]
    raise RuntimeError(f"Unsupported SandboxAgent capability profile: {profile}")


def _use_openai_responses_for_configuration(
    configuration: ModelConfiguration,
    *,
    runtime_tools: list[Any],
) -> bool:
    _model_provider_route(configuration)
    profile = _sandbox_capability_profile_for_configuration(
        configuration,
        runtime_tools=runtime_tools,
    )
    return (
        profile == SandboxCapabilityProfile.RESPONSES_FULL
        or tools_require_openai_responses(runtime_tools)
    )


def _configured_sandbox_capability_profile(
    configuration: ModelConfiguration,
) -> SandboxCapabilityProfile | None:
    native_tool_settings = configuration.native_tool_settings
    if not isinstance(native_tool_settings, dict):
        return None

    sandbox_settings = _record_from_mapping(native_tool_settings, "sandbox_agent")
    if sandbox_settings is None:
        sandbox_settings = _record_from_mapping(native_tool_settings, "sandbox")

    raw_profile: Any = None
    if sandbox_settings is not None:
        raw_profile = (
            sandbox_settings.get("capability_profile")
            or sandbox_settings.get("profile")
            or sandbox_settings.get("compatibility")
        )
    if raw_profile is None:
        raw_profile = native_tool_settings.get("sandbox_capability_profile")

    if raw_profile is not None:
        return _coerce_sandbox_capability_profile(raw_profile)

    compatibility_settings = _record_from_mapping(native_tool_settings, "api_compatibility")
    if compatibility_settings is None:
        return None
    responses_tools = compatibility_settings.get("responses_tools")
    if responses_tools is True:
        return SandboxCapabilityProfile.RESPONSES_FULL
    if responses_tools is False:
        return SandboxCapabilityProfile.CHAT_FUNCTIONS
    return None


def _coerce_sandbox_capability_profile(value: Any) -> SandboxCapabilityProfile:
    normalized = str(value).strip().lower().replace("-", "_")
    alias = _SANDBOX_PROFILE_ALIASES.get(normalized)
    if alias is None:
        allowed = ", ".join(profile.value for profile in SandboxCapabilityProfile)
        raise RuntimeError(
            f"Unsupported SandboxAgent capability profile '{value}'. "
            f"Use one of: {allowed}."
        )
    return SandboxCapabilityProfile(alias)


def _record_from_mapping(mapping: dict[str, Any], key: str) -> dict[str, Any] | None:
    value = mapping.get(key)
    return value if isinstance(value, dict) else None


def _is_configured_responses_compatible_endpoint(endpoint: str) -> bool:
    for env_key in _RESPONSES_COMPATIBLE_ENDPOINT_ENV_KEYS:
        configured_endpoints = os.getenv(env_key, "")
        for configured_endpoint in configured_endpoints.split(","):
            if _endpoint_matches(endpoint, configured_endpoint):
                return True
    return False


def _endpoint_matches(endpoint: str, configured_endpoint: str) -> bool:
    configured_endpoint = configured_endpoint.strip()
    if not configured_endpoint:
        return False
    parsed_endpoint = urlparse(endpoint.strip())
    if "://" not in configured_endpoint:
        return parsed_endpoint.hostname == configured_endpoint.lower()
    parsed_configured = urlparse(configured_endpoint)
    if parsed_endpoint.hostname != parsed_configured.hostname:
        return False
    return _normalized_endpoint(endpoint) == _normalized_endpoint(configured_endpoint)


def _normalized_endpoint(endpoint: str) -> str:
    parsed = urlparse(endpoint.strip())
    scheme = parsed.scheme.lower()
    hostname = (parsed.hostname or "").lower()
    port = f":{parsed.port}" if parsed.port is not None else ""
    path = parsed.path.rstrip("/")
    return f"{scheme}://{hostname}{port}{path}"


def _model_provider_route(configuration: ModelConfiguration) -> str:
    provider_id = configuration.provider_id.strip().lower()
    if _is_official_openai_configuration(configuration):
        return "openai_responses"
    if provider_id in _OPENAI_COMPATIBLE_PROVIDER_IDS:
        return "openai_compatible_chat_completions"
    raise RuntimeError(
        f"Model Provider '{configuration.provider_id}' is not supported by the "
        "Agents SDK runtime yet. Use an OpenAI-compatible endpoint or add a "
        "provider-specific SDK adapter."
    )


def _is_official_openai_configuration(configuration: ModelConfiguration) -> bool:
    return (
        configuration.provider_id.strip().lower() == "openai"
        and _is_official_openai_endpoint(configuration.endpoint)
    )


def _is_official_openai_endpoint(endpoint: str) -> bool:
    return urlparse(endpoint.strip()).hostname == "api.openai.com"


def _runtime_tool_event_from_run_item(
    event: Any,
    *,
    conversation_id: int,
    pending_tool_calls: dict[str, dict[str, object]],
    run_id: int,
) -> dict[str, object] | None:
    events = _runtime_tool_events_from_run_item(
        event,
        conversation_id=conversation_id,
        pending_tool_calls=pending_tool_calls,
        run_id=run_id,
    )
    return events[0] if events else None


def _runtime_tool_events_from_run_item(
    event: Any,
    *,
    conversation_id: int,
    pending_tool_calls: dict[str, dict[str, object]],
    run_id: int,
) -> list[dict[str, object]]:
    item = getattr(event, "item", None)
    item_type = getattr(item, "type", None)
    event_name = getattr(event, "name", None)
    if item is None:
        return []

    if item_type == "tool_call_item" or event_name in {
        "tool_called",
        "tool_search_called",
        "mcp_list_tools",
    }:
        if event_name == "mcp_list_tools" or item_type == "mcp_list_tools_item":
            return []
        tool_call = _runtime_tool_call_payload(
            item,
            conversation_id=conversation_id,
            run_id=run_id,
        )
        pending_tool_calls[str(tool_call["id"])] = tool_call
        tool_events = [{
            "event_type": "tool.call",
            "data": {"tool_call": {**tool_call, "ag_ui_phase": "start"}},
        }]
        if _tool_call_is_terminal(tool_call):
            tool_events.append(
                {
                    "event_type": "tool.call",
                    "data": {"tool_call": {**tool_call, "ag_ui_phase": "result"}},
                }
            )
        return tool_events

    if item_type == "tool_call_output_item" or event_name in {
        "tool_output",
        "tool_search_output_created",
    }:
        tool_call_id = _tool_call_id_from_item(item)
        if tool_call_id is None:
            return []
        known_tool_call = pending_tool_calls.get(tool_call_id, {})
        output_record = _safe_record(getattr(item, "output", None))
        extracted_output = _tool_output_fields(output_record)
        tool_call = {
            **known_tool_call,
            "id": tool_call_id,
            "conversation_id": conversation_id,
            "run_id": run_id,
            **extracted_output,
            "ag_ui_phase": "result",
        }
        tool_call.setdefault("tool_name", "tool")
        tool_call.setdefault("capability", "openai_agents_sdk")
        tool_call.setdefault("safe_input", {})
        tool_call.setdefault(
            "provenance",
            {"gateway": "openai_agents_sdk", "provider": "agents"},
        )
        return [{
            "event_type": "tool.call",
            "data": {"tool_call": tool_call},
        }]

    return []


def _runtime_tool_call_payload(
    item: Any,
    *,
    conversation_id: int,
    run_id: int,
) -> dict[str, object]:
    raw_item = getattr(item, "raw_item", None)
    tool_call_id = _tool_call_id_from_item(item) or f"{run_id}-tool"
    tool_name = _tool_name_from_item(item)
    safe_output = _tool_safe_output_from_raw_item(raw_item)
    status = _tool_status_from_raw_item(raw_item, safe_output=safe_output)
    return {
        "id": tool_call_id,
        "conversation_id": conversation_id,
        "run_id": run_id,
        "tool_name": tool_name,
        "capability": capability_for_tool_name(tool_name),
        "status": status,
        "started_at": "just now",
        "ended_at": "just now" if status != "running" else None,
        "safe_input": project_safe_payload(_tool_input_from_raw_item(raw_item)),
        "safe_output": safe_output,
        "provenance": _tool_provenance_from_raw_item(raw_item),
    }


def _tool_call_id_from_item(item: Any) -> str | None:
    raw_item = getattr(item, "raw_item", None)
    value = (
        getattr(item, "call_id", None)
        or _raw_value(raw_item, "call_id")
        or _raw_value(raw_item, "id")
    )
    return str(value) if value is not None else None


def _tool_name_from_item(item: Any) -> str:
    raw_item = getattr(item, "raw_item", None)
    value = (
        getattr(item, "title", None)
        or getattr(item, "tool_name", None)
        or _raw_value(raw_item, "name")
        or _raw_value(raw_item, "type")
        or "tool"
    )
    return public_tool_name_for_sdk_name(str(value))


def _tool_input_from_raw_item(raw_item: Any) -> dict[str, object]:
    raw_type = _raw_value(raw_item, "type")
    if raw_type == "web_search_call":
        return _safe_record(_raw_value(raw_item, "action"))
    if raw_type in {"shell_call", "local_shell_call"}:
        return _safe_record(_raw_value(raw_item, "action"))
    if raw_type == "computer_call":
        return _safe_record(
            {
                "action": _raw_value(raw_item, "action"),
                "actions": _raw_value(raw_item, "actions"),
            }
        )
    if raw_type == "apply_patch_call":
        return _safe_record({"operation": _raw_value(raw_item, "operation")})
    if raw_type == "custom_tool_call":
        return _safe_record(
            {
                "name": _raw_value(raw_item, "name"),
                "namespace": _raw_value(raw_item, "namespace"),
                "input": _raw_value(raw_item, "input"),
            }
        )
    if raw_type == "code_interpreter_call":
        return _safe_record({"code": _raw_value(raw_item, "code")})
    if raw_type == "file_search_call":
        return _safe_record({"queries": _raw_value(raw_item, "queries")})
    if raw_type == "tool_search_call":
        return _safe_record(
            {
                "arguments": _raw_value(raw_item, "arguments"),
                "execution": _raw_value(raw_item, "execution"),
            }
        )
    return _safe_record(_raw_value(raw_item, "arguments"))


def _tool_safe_output_from_raw_item(raw_item: Any) -> dict[str, object] | None:
    raw_type = _raw_value(raw_item, "type")
    if raw_type == "web_search_call":
        return _safe_record(
            {
                "action": _raw_value(raw_item, "action"),
                "status": _raw_value(raw_item, "status"),
            }
        )
    if raw_type == "mcp_call":
        output = _raw_value(raw_item, "output")
        error = _raw_value(raw_item, "error")
        return _safe_record({"output": output, "error": error})
    if raw_type in {"shell_call", "local_shell_call"}:
        return _safe_record(
            {
                "action": _raw_value(raw_item, "action"),
                "status": _raw_value(raw_item, "status"),
            }
        )
    if raw_type == "computer_call":
        return _safe_record(
            {
                "pending_safety_checks": _raw_value(raw_item, "pending_safety_checks"),
                "status": _raw_value(raw_item, "status"),
            }
        )
    if raw_type == "apply_patch_call":
        return _safe_record(
            {
                "operation": _raw_value(raw_item, "operation"),
                "status": _raw_value(raw_item, "status"),
            }
        )
    if raw_type == "custom_tool_call":
        return _safe_record(
            {
                "name": _raw_value(raw_item, "name"),
                "namespace": _raw_value(raw_item, "namespace"),
            }
        )
    if raw_type == "code_interpreter_call":
        return _safe_record(
            {
                "container_id": _raw_value(raw_item, "container_id"),
                "outputs": _raw_value(raw_item, "outputs"),
                "status": _raw_value(raw_item, "status"),
            }
        )
    if raw_type == "file_search_call":
        return _safe_record(
            {
                "results": _raw_value(raw_item, "results"),
                "status": _raw_value(raw_item, "status"),
            }
        )
    if raw_type == "image_generation_call":
        return _safe_record(
            {
                "result": _raw_value(raw_item, "result"),
                "status": _raw_value(raw_item, "status"),
            }
        )
    if raw_type == "tool_search_call":
        return _safe_record(
            {
                "execution": _raw_value(raw_item, "execution"),
                "status": _raw_value(raw_item, "status"),
            }
        )
    if raw_type == "tool_search_output":
        return _safe_record(
            {
                "output": _raw_value(raw_item, "output"),
                "status": _raw_value(raw_item, "status"),
                "tools": _raw_value(raw_item, "tools"),
            }
        )
    return None


def _tool_status_from_raw_item(
    raw_item: Any,
    *,
    safe_output: dict[str, object] | None,
) -> str:
    raw_status = str(_raw_value(raw_item, "status") or "")
    if raw_status == "failed":
        return "failed"
    if raw_status in {"completed", "incomplete"}:
        return "completed"
    if safe_output and raw_status not in {"in_progress", "searching", "calling", "interpreting"}:
        return "completed"
    return "running"


def _tool_call_is_terminal(tool_call: dict[str, object]) -> bool:
    return str(tool_call.get("status")) in {"completed", "failed", "rejected"}


def _tool_provenance_from_raw_item(raw_item: Any) -> dict[str, str]:
    raw_type = str(_raw_value(raw_item, "type") or "")
    provider_by_type = {
        "web_search_call": "openai_web_search",
        "computer_call": "openai_computer",
        "custom_tool_call": "openai_custom_tool",
        "mcp_call": "openai_hosted_mcp",
        "local_shell_call": "openai_local_shell",
        "shell_call": "openai_hosted_shell",
        "apply_patch_call": "openai_apply_patch",
        "code_interpreter_call": "openai_code_interpreter",
        "file_search_call": "openai_file_search",
        "image_generation_call": "openai_image_generation",
        "tool_search_call": "openai_tool_search",
        "tool_search_output": "openai_tool_search",
    }
    provenance = {
        "gateway": "openai_agents_sdk",
        "provider": provider_by_type.get(raw_type, "agents"),
    }
    server_label = _raw_value(raw_item, "server_label")
    if server_label is not None:
        provenance["server_label"] = str(server_label)
    return provenance


def _tool_output_fields(output_record: dict[str, object]) -> dict[str, object]:
    status_value = str(output_record.get("status") or "completed")
    if status_value not in {"completed", "failed", "rejected", "running"}:
        status_value = "completed"

    safe_output = output_record.get("safe_output")
    if not isinstance(safe_output, dict) and status_value == "completed":
        safe_output = output_record
    elif not isinstance(safe_output, dict):
        safe_output = None

    fields: dict[str, object] = {
        "status": status_value,
        "safe_output": safe_output,
        "ended_at": str(output_record.get("ended_at") or "just now"),
    }
    for key in ("tool_name", "capability", "started_at", "error_summary"):
        value = output_record.get(key)
        if value is not None:
            fields[key] = value
    provenance = output_record.get("provenance")
    if isinstance(provenance, dict):
        fields["provenance"] = provenance
    safe_input = output_record.get("safe_input")
    if isinstance(safe_input, dict):
        fields["safe_input"] = project_safe_payload(safe_input)
    return fields


def _record_runtime_tool_event(*, run_id: int, tool_event: dict[str, object]) -> None:
    data = tool_event.get("data")
    if not isinstance(data, dict):
        return
    tool_call = data.get("tool_call")
    if not isinstance(tool_call, dict):
        return
    if tool_call.get("ag_ui_phase") != "result":
        return
    persisted_tool_call = dict(tool_call)
    persisted_tool_call.pop("ag_ui_phase", None)
    agent_run_execution.record_tool_call(
        agent_run_store.get(run_id),
        tool_call=persisted_tool_call,
    )


def _raw_value(raw_item: Any, key: str) -> Any:
    if isinstance(raw_item, dict):
        return raw_item.get(key)
    return getattr(raw_item, key, None)


def _safe_record(value: Any) -> dict[str, object]:
    if isinstance(value, dict):
        return {
            str(key): _json_safe_value(item)
            for key, item in value.items()
        }
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return {}
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return {"value": value}
        return _safe_record(parsed) if isinstance(parsed, dict) else {"value": parsed}
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        dumped = model_dump(mode="json")
        return _safe_record(dumped) if isinstance(dumped, dict) else {"value": dumped}
    if value is None:
        return {}
    return {"value": str(value)}


def _json_safe_value(value: Any) -> object:
    if isinstance(value, dict):
        return {str(key): _json_safe_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe_value(item) for item in value]
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        return _json_safe_value(model_dump(mode="json"))
    if value is None or isinstance(value, str | int | float | bool):
        return value
    return str(value)


def _run_model_name(run) -> str:
    try:
        model_configuration = _resolve_model_configuration(
            run.capability_snapshot.selected_model_configuration_id
        )
    except Exception:
        return "unresolved"
    return model_configuration.model_name


def _trace_fallback(run) -> dict[str, object]:
    return {
        "workflow_name": "Agent workflow",
        "metadata": {
            "run_id": run.id,
            "conversation_id": run.conversation_id,
            "agent_id": run.capability_snapshot.agent_id,
            "agent_sdk_settings": run.capability_snapshot.sdk_settings.model_dump(mode="json"),
            "model_configuration_id": run.capability_snapshot.selected_model_configuration_id,
            "model_configuration_snapshot": (
                run.capability_snapshot.selected_model_configuration_snapshot
            ),
        },
    }


def _model_configuration_snapshot(configuration: ModelConfiguration) -> dict[str, object]:
    return {
        "id": configuration.id,
        "provider_id": configuration.provider_id,
        "name": configuration.name,
        "model_name": configuration.model_name,
        "endpoint": configuration.endpoint,
        "credential_reference": configuration.credential_reference,
        "model_settings": dict(configuration.model_settings),
        "native_tool_settings": dict(configuration.native_tool_settings),
        "enabled": configuration.enabled,
    }


def _error_message(exc: Exception) -> str:
    detail = getattr(exc, "detail", None)
    return str(detail or exc)


def _last_user_text(input_value: str | list[Any]) -> str:
    if isinstance(input_value, str):
        return input_value
    for item in reversed(input_value):
        if isinstance(item, dict) and item.get("role") == "user":
            content = item.get("content")
            if isinstance(content, str):
                return content
    return ""


def _stream_text_chunks(text: str) -> list[str]:
    chunk_size = 16
    return [text[index:index + chunk_size] for index in range(0, len(text), chunk_size)] or [""]


def _extract_final_output(final_output: object) -> str:
    if isinstance(final_output, str):
        return final_output
    if isinstance(final_output, MessageOutputItem):
        return final_output.raw_item.content[0].text if final_output.raw_item.content else ""
    if isinstance(final_output, ReasoningItem):
        return ""
    if isinstance(final_output, ToolCallItem):
        return ""
    if isinstance(final_output, dict):
        text = final_output.get("text")
        if isinstance(text, str):
            return text
    return str(final_output)


def resolve_model_api_key(credential_reference: str) -> str:
    reference = credential_reference.strip()
    if reference and not reference.startswith(("env:", "secret:", "secret://")):
        return reference

    vault_value = secret_vault_store.get(reference)
    if vault_value:
        return vault_value
    candidates = _credential_environment_candidates(reference)
    for candidate in candidates:
        value = os.environ.get(candidate)
        if value:
            return value
    raise RuntimeError(
        "Model credential is not configured. Set one of: "
        + ", ".join(candidates)
    )


def _credential_environment_candidates(credential_reference: str) -> list[str]:
    reference = credential_reference.strip()
    if reference.startswith("env:"):
        return [reference.removeprefix("env:").strip()]

    normalized = re.sub(r"[^A-Za-z0-9]+", "_", reference).strip("_").upper()
    candidates = []
    if normalized:
        candidates.append(normalized)
        candidates.append(f"MODEL_SECRET_{normalized}")
    return candidates or ["MODEL_SECRET"]


def _model_settings_for_configuration(configuration: ModelConfiguration) -> ModelSettings:
    parameters = runtime_model_parameters_for_configuration(configuration)
    configured_metadata = parameters.pop("metadata", None)
    metadata = {"provider_id": configuration.provider_id}
    if isinstance(configured_metadata, dict):
        metadata.update({
            str(key): str(value)
            for key, value in configured_metadata.items()
            if value is not None
        })
    model_settings_kwargs: dict[str, Any] = {
        "include_usage": True,
        "metadata": metadata,
    }

    for source_key, target_key in _MODEL_PARAMETER_KEY_MAP.items():
        value = parameters.get(source_key)
        if value is not None:
            model_settings_kwargs[target_key] = value

    return ModelSettings(**model_settings_kwargs)


def runtime_model_parameters_for_configuration(
    configuration: ModelConfiguration,
) -> dict[str, Any]:
    parameters = {
        key: value
        for key, value in configuration.model_settings.items()
        if key in _MODEL_PARAMETER_KEY_MAP and value is not None
    }
    return parameters


runtime_store = RuntimeStore()
