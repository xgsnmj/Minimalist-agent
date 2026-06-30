from fastapi import FastAPI


app = FastAPI(title="Minimalist Agent API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "minimalist-agent-api", "status": "ok"}
