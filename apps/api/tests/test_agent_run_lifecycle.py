from apps.api.app.agent_run_lifecycle import agent_run_lifecycle
from apps.api.app.agent_runs import AgentRunCreateRequest, agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.conversations import (
    ConversationCreateRequest,
    ConversationStatus,
    conversation_store,
)
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.run_event_log import run_event_log_store


def setup_function():
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()
    agent_run_store.reset()
    run_event_log_store.reset_for_tests()


def test_agent_run_lifecycle_applies_runtime_success_to_conversation_and_event_log():
    conversation = conversation_store.create(
        owner_user_id=7,
        request=ConversationCreateRequest(
            title="Lifecycle run",
            agent_id=1,
            initial_message="Start this conversation.",
        ),
        agent=agent_store.get(1),
    )

    run = agent_run_lifecycle.queue_for_conversation(
        conversation=conversation,
        request=AgentRunCreateRequest(message="Summarize the task."),
    )
    agent_run_lifecycle.mark_worker_enqueued(run.id)
    agent_run_lifecycle.begin_runtime_execution(run.id)
    completed_run = agent_run_lifecycle.apply_runtime_success(
        run_id=run.id,
        assistant_message="Lifecycle response.",
        process_summaries=[
            "Reviewed the Agent Instruction snapshot.",
            "Used model gpt-5 from openai.",
        ],
        full_trace={"workflow_name": "Agent workflow", "model_name": "gpt-5"},
    )

    assert completed_run.status == "completed"
    assert completed_run.process_summaries == [
        "Reviewed the Agent Instruction snapshot.",
        "Used model gpt-5 from openai.",
    ]
    assert completed_run.full_trace == {
        "workflow_name": "Agent workflow",
        "model_name": "gpt-5",
    }
    assert conversation_store.get_for_user(
        owner_user_id=7,
        conversation_id=conversation.id,
    ).status == ConversationStatus.IDLE
    assert [
        message.content
        for message in conversation_store.get_for_user(
            owner_user_id=7,
            conversation_id=conversation.id,
        ).messages
    ] == [
        "Start this conversation.",
        "Summarize the task.",
        "Lifecycle response.",
    ]
    assert [
        event.event_type
        for event in agent_run_lifecycle.list_events_after_for_user(
            owner_user_id=7,
            run_id=run.id,
            after_sequence=0,
        )
    ] == [
        "run.status",
        "run.status",
        "run.status",
        "process.summary",
        "process.summary",
        "message.completed",
        "run.status",
    ]
