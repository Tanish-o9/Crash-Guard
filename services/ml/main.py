"""
CrashGuard ML Service
Lightweight anomaly detection using rolling z-score against per-user baselines.
No LLMs — deterministic, auditable logic only.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from dotenv import load_dotenv
import os

from app.routers import detect, health
from app.config import settings

load_dotenv()

app = FastAPI(
    title="CrashGuard ML Service",
    description="Anomaly detection service for two-wheeler crash detection",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router)
app.include_router(detect.router, prefix="/detect", tags=["detection"])

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info",
    )
