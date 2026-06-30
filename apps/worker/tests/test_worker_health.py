from apps.api.app.agent_runs import AgentRunCreateRequest, agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.conversations import ConversationCreateRequest, conversation_store
from apps.worker.app.celery_app import process_agent_run, worker_health


def test_worker_health_reports_ok():
    assert worker_health.run() == {
        "service": "minimalist-agent-worker",
        "status": "ok",
    }


def test_process_agent_run_task_completes_mock_runtime_run():
    conversation_store.reset()
    agent_run_store.reset()
    conversation = conversation_store.create(
        owner_user_id=1,
        request=ConversationCreateRequest(
            title="Worker run",
            agent_id=1,
            initial_message="Start this conversation.",
        ),
        agent=agent_store.get(1),
    )
    run = agent_run_store.create_for_conversation(
        conversation=conversation,
        request=AgentRunCreateRequest(message="Summarize the task."),
    )

    assert process_agent_run.run(run.id) == {
        "id": run.id,
        "status": "completed",
    }
