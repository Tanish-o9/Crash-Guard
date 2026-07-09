"""
Amazon Location Service (Places API v2 / geo-places) wrapper.

Provides:
  - reverse_geocode(lat, lng) -> human-readable address (for the spoken location)
  - search_hospitals(lat, lng) -> nearest hospitals with phone numbers
  - place_phone(place_id) -> phone number for a specific place

Auth: if AMAZON_LOCATION_API_KEY is set, requests are sent unsigned with the Key
parameter (Amazon Location API-key auth). Otherwise boto3 falls back to ambient
AWS credentials (SigV4). Every function returns None/[] on any failure so callers
degrade gracefully.
"""
from __future__ import annotations

import logging
from typing import Optional

import boto3
import botocore
from botocore.config import Config

from app.config import settings

logger = logging.getLogger("agent.geo")

_client = None


def _get_client():
    global _client
    if _client is None:
        if settings.AMAZON_LOCATION_API_KEY:
            # API-key auth → unsigned requests, key passed per-call.
            cfg = Config(
                region_name=settings.AMAZON_LOCATION_REGION,
                signature_version=botocore.UNSIGNED,
            )
        else:
            cfg = Config(region_name=settings.AMAZON_LOCATION_REGION)
        _client = boto3.client("geo-places", config=cfg)
    return _client


def _key_kwargs() -> dict:
    return {"Key": settings.AMAZON_LOCATION_API_KEY} if settings.AMAZON_LOCATION_API_KEY else {}


def is_configured() -> bool:
    return bool(settings.AMAZON_LOCATION_API_KEY)


def reverse_geocode(lat: float, lng: float) -> Optional[str]:
    """Coordinates → human-readable address label, or None on failure."""
    try:
        client = _get_client()
        # geo-places positions are [longitude, latitude]
        resp = client.reverse_geocode(
            QueryPosition=[lng, lat],
            MaxResults=1,
            **_key_kwargs(),
        )
        items = resp.get("ResultItems", [])
        if not items:
            return None
        item = items[0]
        return item.get("Address", {}).get("Label") or item.get("Title")
    except Exception as e:
        logger.warning("reverse_geocode failed: %s", e)
        return None


def _extract_phone(item: dict) -> Optional[str]:
    phones = item.get("Contacts", {}).get("Phones", [])
    if phones and isinstance(phones, list):
        val = phones[0].get("Value")
        if val:
            return val.replace(" ", "").replace("-", "")
    return None


def search_hospitals(lat: float, lng: float, radius_m: int = 10000, limit: int = 5) -> list[dict]:
    """Nearest hospitals with name/address/coords/distance/phone. [] on failure."""
    try:
        client = _get_client()
        resp = client.search_nearby(
            QueryPosition=[lng, lat],
            QueryRadius=radius_m,
            Filter={"IncludeCategories": ["hospital"]},
            MaxResults=limit,
            AdditionalFeatures=["Contact"],
            **_key_kwargs(),
        )
        items = resp.get("ResultItems", [])
        out = []
        for it in items:
            pos = it.get("Position", [lng, lat])  # [lon, lat]
            out.append(
                {
                    "place_id": it.get("PlaceId", ""),
                    "name": it.get("Title", "Hospital"),
                    "address": it.get("Address", {}).get("Label"),
                    "lat": pos[1] if len(pos) == 2 else lat,
                    "lng": pos[0] if len(pos) == 2 else lng,
                    "distance_km": round((it.get("Distance", 0) or 0) / 1000, 2),
                    "phone": _extract_phone(it),
                }
            )
        return out
    except Exception as e:
        logger.warning("search_hospitals failed: %s", e)
        return []


def place_phone(place_id: str) -> Optional[str]:
    """Fetch a specific place's phone number via GetPlace."""
    try:
        client = _get_client()
        resp = client.get_place(
            PlaceId=place_id,
            AdditionalFeatures=["Contact"],
            **_key_kwargs(),
        )
        return _extract_phone(resp)
    except Exception as e:
        logger.warning("place_phone failed: %s", e)
        return None
