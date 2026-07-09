"""
Thin wrapper around Amazon Bedrock (Nova Pro) using the Converse API.

Auth: boto3 automatically uses the AWS_BEARER_TOKEN_BEDROCK environment variable
for the bedrock-runtime client, so no access-key/secret pair is needed.

Every caller must treat Bedrock as best-effort: if the model is slow, unreachable,
or misconfigured, `converse()` returns None and the caller falls back to a
deterministic template. Nothing in the emergency path may block on the LLM.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings

logger = logging.getLogger("agent.bedrock")

_client = None


def _get_client():
    global _client
    if _client is None:
        cfg = Config(
            region_name=settings.AWS_REGION,
            connect_timeout=settings.BEDROCK_TIMEOUT_SECONDS,
            read_timeout=settings.BEDROCK_TIMEOUT_SECONDS,
            retries={"max_attempts": 1, "mode": "standard"},
        )
        _client = boto3.client("bedrock-runtime", config=cfg)
    return _client


def converse(system_prompt: str, user_prompt: str) -> Optional[str]:
    """
    Send a single-turn prompt to Nova Pro via the Converse API.
    Returns the model's text, or None on any failure (caller must fall back).
    """
    try:
        client = _get_client()
        resp = client.converse(
            modelId=settings.BEDROCK_MODEL_ID,
            system=[{"text": system_prompt}],
            messages=[{"role": "user", "content": [{"text": user_prompt}]}],
            inferenceConfig={
                "maxTokens": settings.BEDROCK_MAX_TOKENS,
                "temperature": settings.BEDROCK_TEMPERATURE,
            },
        )
        parts = resp.get("output", {}).get("message", {}).get("content", [])
        text = "".join(p.get("text", "") for p in parts).strip()
        return text or None
    except (ClientError, BotoCoreError) as e:
        logger.warning("Bedrock converse failed: %s", e)
        return None
    except Exception as e:  # never let the LLM path crash the request
        logger.warning("Bedrock unexpected error: %s", e)
        return None


def converse_json(system_prompt: str, user_prompt: str) -> Optional[dict]:
    """Call converse() and best-effort parse a JSON object out of the reply."""
    text = converse(system_prompt, user_prompt)
    if not text:
        return None
    # Strip markdown fences if the model wrapped the JSON.
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text
    # Fall back to the first {...} block.
    if not fenced:
        brace = re.search(r"\{.*\}", candidate, re.DOTALL)
        if brace:
            candidate = brace.group(0)
    try:
        return json.loads(candidate)
    except (json.JSONDecodeError, ValueError):
        logger.warning("Bedrock returned non-JSON: %s", text[:200])
        return None


def bedrock_available() -> bool:
    """Lightweight readiness signal for the health endpoint (does not call the model)."""
    import os
    return bool(os.environ.get("AWS_BEARER_TOKEN_BEDROCK"))
