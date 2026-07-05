from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
import os
import re
import time
from typing import Any

from agents import Agent, Model, ModelProvider, ModelSettings, ModelTracing, OpenAIProvider, Runner, RunConfig
from agents.items import ModelResponse, MessageOutputItem, ReasoningItem, ToolCallItem
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

from apps.api.app.agent_run_lifecycle import agent_run_lifecycle
from apps.api.app.agent_runs import AgentRunStatus, agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.model_configurations import ModelConfiguration, model_configuration_store
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
}

_TEMPERATURE_PARAMETER_ALLOWLIST: set[tuple[str, str]] = set()


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
            agent_run_lifecycle.apply_runtime_failure(
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
            agent_run_lifecycle.apply_runtime_failure(
                run_id=run.id,
                message=_error_message(exc),
            )
            failed_run = agent_run_store.get(run.id)
            return self._runtime_result_from_run(failed_run, full_trace=_trace_fallback(failed_run))
        agent = agent_store.get(run.capability_snapshot.agent_id)
        provider_id = model_configuration.provider_id
        model_name = model_configuration.model_name
        try:
            model_provider = self._model_provider(model_configuration)
            model_settings = _model_settings_for_configuration(model_configuration)
        except Exception as exc:
            agent_run_lifecycle.apply_runtime_failure(
                run_id=run.id,
                message=_error_message(exc),
            )
            failed_run = agent_run_store.get(run.id)
            return self._runtime_result_from_run(failed_run, full_trace=_trace_fallback(failed_run))

        trace_processor = _CapturedTraceProcessor()
        set_trace_processors([trace_processor])

        agent_run_lifecycle.begin_runtime_execution(run.id)

        runtime_agent = Agent(
            name=agent.name,
            instructions=agent.instruction,
            model=model_name,
        )
        run_config = RunConfig(
            model_provider=model_provider,
            model_settings=model_settings,
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
            },
        )

        try:
            result = Runner.run_sync(runtime_agent, run.user_message, run_config=run_config)
        except Exception as exc:
            agent_run_lifecycle.apply_runtime_failure(
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
        trace["provider_id"] = provider_id
        trace["model_name"] = model_name
        trace["endpoint"] = model_configuration.endpoint
        agent_run_lifecycle.apply_runtime_success(
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
            failed_run = agent_run_lifecycle.apply_runtime_failure(
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
            failed_run = agent_run_lifecycle.apply_runtime_failure(
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
            model_provider = self._model_provider(model_configuration)
            model_settings = _model_settings_for_configuration(model_configuration)
        except Exception as exc:
            failed_run = agent_run_lifecycle.apply_runtime_failure(
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
        running_run = agent_run_lifecycle.begin_runtime_execution(run.id)
        yield {
            "event_type": "run.status",
            "data": {"status": running_run.status.value},
        }

        runtime_agent = Agent(
            name=agent.name,
            instructions=agent.instruction,
            model=model_name,
        )
        run_config = RunConfig(
            model_provider=model_provider,
            model_settings=model_settings,
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
            },
        )

        assistant_chunks: list[str] = []
        try:
            result = Runner.run_streamed(runtime_agent, run.user_message, run_config=run_config)
            async for event in result.stream_events():
                if event.type != "raw_response_event":
                    continue
                if event.data.type != "response.output_text.delta":
                    continue
                delta = event.data.delta
                if not delta:
                    continue
                assistant_chunks.append(delta)
                agent_run_lifecycle.record_message_delta(running_run, delta=delta)
                yield {
                    "event_type": "message.delta",
                    "data": {"role": "assistant", "delta": delta},
                }
        except Exception as exc:
            failed_run = agent_run_lifecycle.apply_runtime_failure(
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
        trace["provider_id"] = provider_id
        trace["model_name"] = model_name
        trace["endpoint"] = model_configuration.endpoint
        agent_run_lifecycle.apply_runtime_success(
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

    def _model_provider(self, configuration: ModelConfiguration) -> ModelProvider:
        if self._model_provider_factory is not None:
            return self._model_provider_factory(configuration)
        return OpenAIProvider(
            api_key=resolve_model_api_key(configuration.credential_reference),
            base_url=configuration.endpoint,
            use_responses=False,
        )


def _resolve_model_configuration(configuration_id: int | None):
    if configuration_id is None:
        raise RuntimeError("Agent Run does not have a selected Model Configuration.")
    configuration = model_configuration_store.get(configuration_id)
    if not configuration.enabled:
        raise RuntimeError("Model Configuration is disabled.")
    return configuration


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
        "default_parameters": dict(configuration.default_parameters),
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
    model_settings_kwargs: dict[str, Any] = {
        "include_usage": True,
        "metadata": {"provider_id": configuration.provider_id},
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
        for key, value in configuration.default_parameters.items()
        if key != "temperature" and key in _MODEL_PARAMETER_KEY_MAP and value is not None
    }
    temperature = configuration.default_parameters.get("temperature")
    if temperature is not None and _allows_temperature(configuration):
        parameters["temperature"] = temperature
    return parameters


def _allows_temperature(configuration: ModelConfiguration) -> bool:
    provider_id = configuration.provider_id.strip().lower()
    model_name = configuration.model_name.strip().lower()
    return (provider_id, model_name) in _TEMPERATURE_PARAMETER_ALLOWLIST


runtime_store = RuntimeStore()
