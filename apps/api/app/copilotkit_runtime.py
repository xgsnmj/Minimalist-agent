from __future__ import annotations

import asyncio
import json
import os
import time
from collections.abc import AsyncIterator, Iterable
from contextlib import suppress
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from apps.api.app.agent_run_execution import agent_run_execution
from apps.api.app.agent_runs import (
    ACTIVE_RUN_STATUSES,
    AgentRunCreateRequest,
    AgentRunStatus,
    agent_run_store,
)
from apps.api.app.agents import Agent, AgentStatus, agent_store
from apps.api.app.auth import LocalAccount, local_account_store
from apps.api.app.conversations import (
    AgentConversation,
    conversation_store,
)
from apps.api.app.model_selection import resolve_agent_model_configuration_id
from apps.api.app.runtime import runtime_store


router = APIRouter(prefix="/copilotkit", tags=["copilotkit"])
SSE_HEARTBEAT_COMMENT = ": heartbeat\n\n"


class CopilotKitRunRequest(BaseModel):
    threadId: str = Field(min_length=1)
    runId: str = Field(min_length=1)
    state: Any = None
    messages: list[dict[str, Any]] = []
    tools: list[dict[str, Any]] = []
    context: list[dict[str, Any]] = []
    forwardedProps: Any = None
    parentRunId: str | None = None
    resume: list[dict[str, Any]] | None = None


class CopilotThreadMappingStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self._thread_to_conversation_id = {}

    def get(self, *, owner_user_id: int, thread_id: str) -> int | None:
        return self._thread_to_conversation_id.get((owner_user_id, thread_id))

    def set(self, *, owner_user_id: int, thread_id: str, conversation_id: int) -> None:
        self._thread_to_conversation_id[(owner_user_id, thread_id)] = conversation_id


copilot_thread_mapping_store = CopilotThreadMappingStore()


def authenticated_copilotkit_account(
    authorization: str | None = Header(default=None),
    access_token: str | None = Query(default=None),
) -> LocalAccount:
    if authorization is not None and authorization.startswith("Bearer "):
        account = local_account_store.account_for_token(
            authorization.removeprefix("Bearer ").strip(),
        )
        if account is not None:
            return account
    if access_token:
        account = local_account_store.account_for_token(access_token)
        if account is not None:
            return account
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
    )


@router.get("/info")
def get_copilotkit_runtime_info(
    _account: LocalAccount = Depends(authenticated_copilotkit_account),
) -> dict[str, object]:
    return {
        "version": "1.62.1",
        "mode": "sse",
        "audioFileTranscriptionEnabled": False,
        "openGenerativeUIEnabled": False,
        "telemetryDisabled": True,
        "agents": {
            _copilot_agent_id(agent): {
                "name": agent.name,
                "className": "OpenAIAgentsSDKRuntimeAdapter",
                "description": agent.description or agent.name,
                "capabilities": {
                    "transport": {"streaming": True},
                    "tools": {"supported": True},
                    "custom": {
                        "agentRuntime": "openai-agents-sdk",
                        "agentRunOwner": "backend",
                    },
                },
            }
            for agent in agent_store.list_agents()
            if agent.status == AgentStatus.ENABLED
        },
    }


@router.post("/agent/{copilot_agent_id}/connect")
def connect_copilotkit_agent(
    copilot_agent_id: str,
    request: CopilotKitRunRequest,
    account: LocalAccount = Depends(authenticated_copilotkit_account),
) -> StreamingResponse:
    _resolve_agent(copilot_agent_id)
    conversation = _existing_conversation_for_request(account=account, request=request)
    events = [
        _run_started_event(request),
        *_conversation_snapshot_events(conversation),
        _run_finished_event(request, result={"status": "connected"}),
    ]
    return _event_stream(events)


@router.post("/agent/{copilot_agent_id}/run")
def run_copilotkit_agent(
    copilot_agent_id: str,
    request: CopilotKitRunRequest,
    account: LocalAccount = Depends(authenticated_copilotkit_account),
) -> StreamingResponse:
    agent = _resolve_agent(copilot_agent_id)
    user_message = _latest_user_text(request.messages)
    if not user_message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CopilotKit run requires a user message.",
        )

    conversation = _conversation_for_run(
        account=account,
        agent=agent,
        request=request,
        user_message=user_message,
    )
    if conversation.agent.id != agent.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="CopilotKit Agent does not match the Agent Conversation.",
        )

    run = agent_run_execution.queue_for_conversation(
        conversation=conversation,
        request=AgentRunCreateRequest(message=user_message),
    )
    agent_run_execution.mark_worker_enqueued(run.id)

    async def stream_events() -> AsyncIterator[str]:
        yield _sse_data(_run_started_event(request))
        base_message_id = f"agent-run-{run.id}-assistant"
        current_message_id: str | None = None
        message_open = False
        message_segment_count = 0
        message_started = False
        async for runtime_event in runtime_store.stream_execute(run.id):
            event_type = runtime_event["event_type"]
            data = runtime_event["data"]
            if event_type == "message.delta":
                delta = data.get("delta") if isinstance(data, dict) else None
                if not isinstance(delta, str):
                    continue
                if not message_open:
                    message_segment_count += 1
                    current_message_id = (
                        base_message_id
                        if message_segment_count == 1
                        else f"{base_message_id}-{message_segment_count}"
                    )
                    yield _sse_data(
                        {
                            "type": "TEXT_MESSAGE_START",
                            "messageId": current_message_id,
                            "role": "assistant",
                        }
                    )
                    message_open = True
                    message_started = True
                yield _sse_data(
                    {
                        "type": "TEXT_MESSAGE_CONTENT",
                        "messageId": current_message_id,
                        "delta": delta,
                    }
                )
                continue
            if event_type == "tool.call" and isinstance(data, dict):
                tool_call = data.get("tool_call")
                if isinstance(tool_call, dict):
                    if message_open and current_message_id is not None:
                        yield _sse_data(
                            {
                                "type": "TEXT_MESSAGE_END",
                                "messageId": current_message_id,
                            }
                        )
                        message_open = False
                    for event in _tool_call_events(tool_call=tool_call):
                        yield event
                continue
        completed_run = agent_run_store.get(run.id)
        if message_open and current_message_id is not None:
            yield _sse_data(
                {
                    "type": "TEXT_MESSAGE_END",
                    "messageId": current_message_id,
                }
            )
        for event in _events_for_completed_run(
            request=request,
            run_id=completed_run.id,
            include_message=not message_started,
        ):
            yield event

    return _sse_stream_response(_with_sse_heartbeats(stream_events()))


@router.post("/agent/{copilot_agent_id}/stop/{thread_id}")
def stop_copilotkit_agent(
    copilot_agent_id: str,
    thread_id: str,
    account: LocalAccount = Depends(authenticated_copilotkit_account),
) -> Response:
    _resolve_agent(copilot_agent_id)
    conversation = _existing_conversation_for_thread(
        owner_user_id=account.id,
        thread_id=thread_id,
    )
    if conversation is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    active_run = _active_run_for_conversation(
        owner_user_id=account.id,
        conversation_id=conversation.id,
    )
    if active_run is not None:
        agent_run_execution.cancel_for_user(
            owner_user_id=account.id,
            run_id=active_run.id,
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _event_stream(events: list[dict[str, Any]]) -> StreamingResponse:
    return _sse_stream_response(iter([_sse_data(event) for event in events]))


def _sse_stream_response(content: Iterable[str] | AsyncIterator[str]) -> StreamingResponse:
    return StreamingResponse(
        content=content,
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
        media_type="text/event-stream",
    )


def _sse_data(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, separators=(',', ':'))}\n\n"


async def _with_sse_heartbeats(stream: AsyncIterator[str]) -> AsyncIterator[str]:
    heartbeat_seconds = _sse_heartbeat_seconds()
    if heartbeat_seconds <= 0:
        async for chunk in stream:
            yield chunk
        return

    iterator = stream.__aiter__()
    pending: asyncio.Task[str] | None = None
    try:
        while True:
            if pending is None:
                pending = asyncio.create_task(anext(iterator))
            done, _ = await asyncio.wait({pending}, timeout=heartbeat_seconds)
            if pending not in done:
                yield SSE_HEARTBEAT_COMMENT
                continue

            try:
                chunk = pending.result()
            except StopAsyncIteration:
                break
            pending = None
            yield chunk
    finally:
        if pending is not None and not pending.done():
            pending.cancel()
            with suppress(asyncio.CancelledError):
                await pending
        aclose = getattr(iterator, "aclose", None)
        if aclose is not None:
            await aclose()


def _run_started_event(request: CopilotKitRunRequest) -> dict[str, Any]:
    event: dict[str, Any] = {
        "type": "RUN_STARTED",
        "threadId": request.threadId,
        "runId": request.runId,
        "input": request.model_dump(mode="json"),
    }
    if request.parentRunId is not None:
        event["parentRunId"] = request.parentRunId
    return event


def _run_finished_event(
    request: CopilotKitRunRequest,
    *,
    result: dict[str, Any],
) -> dict[str, Any]:
    return {
        "type": "RUN_FINISHED",
        "threadId": request.threadId,
        "runId": request.runId,
        "result": result,
        "outcome": {"type": "success"},
    }


def _events_for_completed_run(
    *,
    request: CopilotKitRunRequest,
    run_id: int,
    include_message: bool = True,
) -> Iterable[str]:
    run = agent_run_store.get(run_id)
    if run.status == AgentRunStatus.COMPLETED:
        if include_message and run.assistant_message:
            yield from _text_message_events(
                message_id=f"agent-run-{run.id}-assistant",
                text=run.assistant_message,
            )
        yield _sse_data(
            _run_finished_event(
                request,
                result={
                    "agentRunId": run.id,
                    "status": run.status.value,
                    "conversationId": run.conversation_id,
                },
            )
        )
        return

    if run.status == AgentRunStatus.CANCELLED:
        yield _sse_data(
            _run_finished_event(
                request,
                result={
                    "agentRunId": run.id,
                    "status": run.status.value,
                    "conversationId": run.conversation_id,
                },
            )
        )
        return

    if run.status == AgentRunStatus.FAILED:
        if include_message and run.assistant_message:
            yield from _text_message_events(
                message_id=f"agent-run-{run.id}-assistant-error",
                text=run.assistant_message,
            )
        yield _sse_data(
            {
                "type": "RUN_ERROR",
                "message": run.error or "Agent Run failed.",
                "code": "AGENT_RUN_FAILED",
            }
        )
        return

    yield _sse_data(
        {
            "type": "RUN_ERROR",
            "message": run.error or "Agent Run failed.",
            "code": "AGENT_RUN_FAILED",
        }
    )


def _text_message_events(*, message_id: str, text: str) -> Iterable[str]:
    yield _sse_data(
        {
            "type": "TEXT_MESSAGE_START",
            "messageId": message_id,
            "role": "assistant",
        }
    )
    chunks = _chunk_text(text)
    delay_seconds = _stream_chunk_delay_seconds()
    for index, chunk in enumerate(chunks):
        yield _sse_data(
            {
                "type": "TEXT_MESSAGE_CONTENT",
                "messageId": message_id,
                "delta": chunk,
            }
        )
        if delay_seconds > 0 and index < len(chunks) - 1:
            time.sleep(delay_seconds)
    yield _sse_data(
        {
            "type": "TEXT_MESSAGE_END",
            "messageId": message_id,
        }
    )


def _tool_call_events(*, tool_call: dict[str, Any]) -> Iterable[str]:
    tool_call_id = str(
        tool_call.get("id")
        or tool_call.get("tool_call_id")
        or f"tool-call-{tool_call.get('tool_name') or tool_call.get('name') or 'unknown'}"
    )
    tool_name = str(tool_call.get("tool_name") or tool_call.get("name") or "tool")
    safe_input = tool_call.get("safe_input")
    safe_output = tool_call.get("safe_output")
    result_payload = {
        "status": tool_call.get("status") or "completed",
        "toolName": tool_name,
        "output": safe_output,
    }
    error_summary = tool_call.get("error_summary")
    if error_summary:
        result_payload["error"] = error_summary

    phase = str(tool_call.get("ag_ui_phase") or "complete")
    if phase in {"start", "complete"}:
        yield _sse_data(
            {
                "type": "TOOL_CALL_START",
                "toolCallId": tool_call_id,
                "toolCallName": tool_name,
            }
        )
        yield _sse_data(
            {
                "type": "TOOL_CALL_ARGS",
                "toolCallId": tool_call_id,
                "delta": _json_string(safe_input if isinstance(safe_input, dict) else {}),
            }
        )
    if phase in {"result", "complete"}:
        yield _sse_data(
            {
                "type": "TOOL_CALL_END",
                "toolCallId": tool_call_id,
            }
        )
        yield _sse_data(
            {
                "type": "TOOL_CALL_RESULT",
                "messageId": f"{tool_call_id}-result",
                "toolCallId": tool_call_id,
                "content": _json_string(result_payload),
                "role": "tool",
            }
        )


def _json_string(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _chunk_text(text: str) -> list[str]:
    chunk_size = 24
    return [text[index:index + chunk_size] for index in range(0, len(text), chunk_size)] or [""]


def _stream_chunk_delay_seconds() -> float:
    raw_value = os.getenv("COPILOTKIT_STREAM_CHUNK_DELAY_SECONDS", "0.012")
    try:
        return max(float(raw_value), 0)
    except ValueError:
        return 0.012


def _sse_heartbeat_seconds() -> float:
    raw_value = os.getenv("COPILOTKIT_SSE_HEARTBEAT_SECONDS", "15")
    try:
        return max(float(raw_value), 0)
    except ValueError:
        return 15


def _conversation_snapshot_events(
    conversation: AgentConversation | None,
) -> list[dict[str, Any]]:
    if conversation is None:
        return []
    return [
        {
            "type": "MESSAGES_SNAPSHOT",
            "messages": [
                {
                    "id": f"conversation-{conversation.id}-message-{index}",
                    "role": message.role,
                    "content": message.content,
                }
                for index, message in enumerate(conversation.messages, start=1)
                if message.role in {"user", "assistant"}
            ],
        }
    ]


def _resolve_agent(copilot_agent_id: str) -> Agent:
    agent_id = _backend_agent_id(copilot_agent_id)
    agent = agent_store.get(agent_id)
    if agent.status != AgentStatus.ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="CopilotKit Agent not found.",
        )
    return agent


def _backend_agent_id(copilot_agent_id: str) -> int:
    if copilot_agent_id == "default":
        for agent in agent_store.list_agents():
            if agent.is_default:
                return agent.id
        return 1
    if copilot_agent_id.startswith("agent-"):
        suffix = copilot_agent_id.removeprefix("agent-")
        if suffix.isdigit():
            return int(suffix)
    if copilot_agent_id.isdigit():
        return int(copilot_agent_id)
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="CopilotKit Agent not found.",
    )


def _copilot_agent_id(agent: Agent) -> str:
    return "default" if agent.is_default else f"agent-{agent.id}"


def _conversation_for_run(
    *,
    account: LocalAccount,
    agent: Agent,
    request: CopilotKitRunRequest,
    user_message: str,
) -> AgentConversation:
    conversation = _existing_conversation_for_request(account=account, request=request)
    if conversation is not None:
        _remember_thread_mappings(
            owner_user_id=account.id,
            request=request,
            conversation_id=conversation.id,
        )
        return conversation

    selected_model_configuration_id = resolve_agent_model_configuration_id(
        agent=agent,
        selected_model_configuration_id=_selected_model_configuration_id(request),
    )
    created = conversation_store.create_empty(
        owner_user_id=account.id,
        title=_conversation_title(user_message),
        agent=agent,
        selected_model_configuration_id=selected_model_configuration_id,
    )
    _remember_thread_mappings(
        owner_user_id=account.id,
        request=request,
        conversation_id=created.id,
    )
    return created


def _existing_conversation_for_request(
    *,
    account: LocalAccount,
    request: CopilotKitRunRequest,
) -> AgentConversation | None:
    forwarded_conversation_id = _forwarded_conversation_id(request)
    if forwarded_conversation_id is not None:
        return _conversation_for_id(
            owner_user_id=account.id,
            conversation_id=forwarded_conversation_id,
        )

    forwarded_thread_id = _forwarded_thread_id(request)
    if forwarded_thread_id is not None:
        conversation = _existing_conversation_for_thread(
            owner_user_id=account.id,
            thread_id=forwarded_thread_id,
        )
        if conversation is not None:
            return conversation

    return _existing_conversation_for_thread(
        owner_user_id=account.id,
        thread_id=request.threadId,
    )


def _existing_conversation_for_thread(
    *,
    owner_user_id: int,
    thread_id: str,
) -> AgentConversation | None:
    conversation_id = _conversation_id_from_thread(thread_id)
    if conversation_id is None:
        conversation_id = copilot_thread_mapping_store.get(
            owner_user_id=owner_user_id,
            thread_id=thread_id,
        )
    if conversation_id is None:
        return None
    return _conversation_for_id(
        owner_user_id=owner_user_id,
        conversation_id=conversation_id,
    )


def _conversation_for_id(
    *,
    owner_user_id: int,
    conversation_id: int,
) -> AgentConversation | None:
    try:
        return conversation_store.get_for_user(
            owner_user_id=owner_user_id,
            conversation_id=conversation_id,
        )
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            return None
        raise


def _remember_thread_mappings(
    *,
    owner_user_id: int,
    request: CopilotKitRunRequest,
    conversation_id: int,
) -> None:
    thread_ids = {
        request.threadId,
        _forwarded_thread_id(request),
    }
    for thread_id in thread_ids:
        if thread_id:
            copilot_thread_mapping_store.set(
                owner_user_id=owner_user_id,
                thread_id=thread_id,
                conversation_id=conversation_id,
            )


def _conversation_id_from_thread(thread_id: str) -> int | None:
    if thread_id.isdigit():
        return int(thread_id)
    if thread_id.startswith("conversation-"):
        suffix = thread_id.removeprefix("conversation-")
        if suffix.isdigit():
            return int(suffix)
    return None


def _forwarded_conversation_id(request: CopilotKitRunRequest) -> int | None:
    return _optional_int_payload_field(
        _forwarded_props(request),
        "conversation_id",
        "conversationId",
    )


def _forwarded_thread_id(request: CopilotKitRunRequest) -> str | None:
    forwarded_props = _forwarded_props(request)
    value = forwarded_props.get("thread_id", forwarded_props.get("threadId"))
    return value if isinstance(value, str) and value.strip() else None


def _selected_model_configuration_id(request: CopilotKitRunRequest) -> int | None:
    for payload in (_forwarded_props(request), _request_state(request)):
        value = _optional_int_payload_field(
            payload,
            "selected_model_configuration_id",
            "selectedModelConfigurationId",
        )
        if value is not None:
            return value
    return None


def _forwarded_props(request: CopilotKitRunRequest) -> dict[str, Any]:
    return request.forwardedProps if isinstance(request.forwardedProps, dict) else {}


def _request_state(request: CopilotKitRunRequest) -> dict[str, Any]:
    return request.state if isinstance(request.state, dict) else {}


def _optional_int_payload_field(
    payload: dict[str, Any],
    *field_names: str,
) -> int | None:
    for field_name in field_names:
        if field_name not in payload:
            continue
        value = payload[field_name]
        if value is None:
            return None
        if isinstance(value, bool):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name} must be an integer.",
            )
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be an integer.",
        )
    return None


def _latest_user_text(messages: list[dict[str, Any]]) -> str:
    for message in reversed(messages):
        if message.get("role") != "user":
            continue
        return _message_content_text(message.get("content")).strip()
    return ""


def _message_content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            part["text"]
            for part in content
            if isinstance(part, dict)
            and part.get("type") == "text"
            and isinstance(part.get("text"), str)
        )
    return ""


def _conversation_title(user_message: str) -> str:
    first_line = user_message.strip().splitlines()[0] if user_message.strip() else ""
    if not first_line:
        return "新对话"
    return first_line[:48]


def _active_run_for_conversation(*, owner_user_id: int, conversation_id: int):
    return agent_run_store.latest_active_for_conversation(
        owner_user_id=owner_user_id,
        conversation_id=conversation_id,
        active_statuses=ACTIVE_RUN_STATUSES,
    )
