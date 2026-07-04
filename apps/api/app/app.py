from fastapi import FastAPI

from apps.api.app.features.admin import router as admin_router
from apps.api.app.features.auth import router as auth_router
from apps.api.app.features.copilotkit.routes import router as copilotkit_router
from apps.api.app.features.workspace import router as workspace_router


app = FastAPI(title="Minimalist Agent API")
app.include_router(copilotkit_router)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(workspace_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "minimalist-agent-api", "status": "ok"}

