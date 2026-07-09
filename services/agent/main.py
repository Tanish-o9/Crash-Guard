"""
CrashGuard AI Agent service.

Hosts the downstream LLM-backed helpers (Amazon Bedrock / Nova Pro) that compose
spoken scripts and messages, plus server-side Google Places hospital search.

IMPORTANT: nothing here makes a safety-critical decision. The device's
deterministic state machine decides whether to alarm / call. These endpoints only
generate text and look up data, and every LLM endpoint has a deterministic
fallback so the emergency path never depends on this service being reachable.

Run:  uvicorn main:app --reload --port 8100
"""
from dotenv import load_dotenv

load_dotenv()  # load .env (incl. AWS_BEARER_TOKEN_BEDROCK) before boto3 clients init

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from app.routers import health, dispatcher, intake, relative, hospital, call  # noqa: E402

app = FastAPI(title="CrashGuard Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(dispatcher.router, prefix="/agent/dispatcher-script", tags=["agent"])
app.include_router(intake.router, prefix="/agent/samaritan-intake", tags=["agent"])
app.include_router(relative.router, prefix="/agent/relative-message", tags=["agent"])
app.include_router(hospital.router, prefix="/hospital", tags=["hospital"])
app.include_router(call.router, prefix="/call", tags=["call"])


@app.get("/")
async def root():
    return {"service": "crashguard-agent", "docs": "/docs", "health": "/health"}
