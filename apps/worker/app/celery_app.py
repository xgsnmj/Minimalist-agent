from celery import Celery

from apps.api.app.agent_runs import agent_run_store
from apps.api.app.runtime import runtime_store
from apps.worker.app.settings import get_redis_url


celery_app = Celery(
    "minimalist-agent-worker",
    broker=get_redis_url(),
    backend=get_redis_url(),
)


@celery_app.task(name="minimalist_agent_worker.health")
def worker_health() -> dict[str, str]:
    return {"service": "minimalist-agent-worker", "status": "ok"}


@celery_app.task(name="minimalist_agent_worker.process_agent_run")
def process_agent_run(run_id: int) -> dict[str, str | int]:
    run = runtime_store.execute(run_id)
    return {
        "id": run["id"],
        "status": run["status"],
    }
