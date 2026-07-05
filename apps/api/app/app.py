import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from apps.api.app.auth import local_account_store
from apps.api.app.bootstrap import bootstrap_default_model_configuration
from apps.api.app.features.admin import router as admin_router
from apps.api.app.features.auth import router as auth_router
from apps.api.app.features.copilotkit.routes import router as copilotkit_router
from apps.api.app.features.workspace import router as workspace_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    username = os.getenv("ADMIN_BOOTSTRAP_USERNAME", "").strip()
    password = os.getenv("ADMIN_BOOTSTRAP_PASSWORD", "").strip()
    if username and password:
        local_account_store.bootstrap_administrator(username=username, password=password)
    bootstrap_default_model_configuration()
    yield


app = FastAPI(title="Minimalist Agent API", lifespan=lifespan)
app.include_router(copilotkit_router)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(workspace_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "minimalist-agent-api", "status": "ok"}
