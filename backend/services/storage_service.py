"""
Object Storage Service for THERMASHELL.
Supports Supabase Storage and resilient Local Object Storage fallback.
Manages buckets: climate/, simulation/, ansys/, reports/, exports/.
"""

import os
import io
import json
import logging
from typing import Optional, Dict, Any
from pathlib import Path
import httpx

from config import settings

logger = logging.getLogger("thermashell.storage")

BUCKETS = ["climate", "simulation", "ansys", "reports", "exports"]


class StorageService:
    def __init__(self):
        self.backend = settings.STORAGE_BACKEND
        self.local_root = Path(settings.STORAGE_LOCAL_DIR).resolve()
        self.supabase_url = settings.SUPABASE_URL
        self.supabase_key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY

        # Ensure local directories exist for all buckets
        for b in BUCKETS:
            (self.local_root / b).mkdir(parents=True, exist_ok=True)

    def _get_local_path(self, bucket: str, path: str) -> Path:
        clean_path = path.lstrip("/\\")
        return self.local_root / bucket / clean_path

    async def save_artifact(
        self,
        bucket: str,
        path: str,
        content: str | bytes | dict,
        content_type: str = "application/json"
    ) -> str:
        """
        Saves an artifact to object storage.
        Returns the storage path / identifier.
        """
        if isinstance(content, dict):
            data = json.dumps(content, indent=2).encode("utf-8")
            content_type = "application/json"
        elif isinstance(content, str):
            data = content.encode("utf-8")
        else:
            data = content

        # 1. Supabase Storage if configured
        if self.supabase_url and self.supabase_key and self.backend == "supabase":
            try:
                url = f"{self.supabase_url.rstrip('/')}/storage/v1/object/{bucket}/{path.lstrip('/')}"
                headers = {
                    "apikey": self.supabase_key,
                    "Authorization": f"Bearer {self.supabase_key}",
                    "Content-Type": content_type,
                    "x-upsert": "true",
                }
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(url, content=data, headers=headers)
                    if resp.status_code in (200, 201):
                        return f"supabase://{bucket}/{path.lstrip('/')}"
                    logger.warning("Supabase upload returned %d: %s. Falling back to local.", resp.status_code, resp.text)
            except Exception as e:
                logger.warning("Supabase storage error: %s. Falling back to local storage.", e)

        # 2. Local resilient object storage
        local_file = self._get_local_path(bucket, path)
        local_file.parent.mkdir(parents=True, exist_ok=True)
        local_file.write_bytes(data)
        logger.info("Saved artifact locally to %s", local_file)
        return f"storage://{bucket}/{path.lstrip('/')}"

    async def get_artifact(self, bucket: str, path: str) -> Optional[bytes]:
        """Retrieves artifact bytes from storage."""
        # Check local storage first
        local_file = self._get_local_path(bucket, path)
        if local_file.exists():
            return local_file.read_bytes()

        # Check Supabase
        if self.supabase_url and self.supabase_key:
            try:
                url = f"{self.supabase_url.rstrip('/')}/storage/v1/object/public/{bucket}/{path.lstrip('/')}"
                headers = {
                    "apikey": self.supabase_key,
                    "Authorization": f"Bearer {self.supabase_key}",
                }
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.get(url, headers=headers)
                    if resp.status_code == 200:
                        return resp.content
            except Exception as e:
                logger.error("Failed to fetch from Supabase storage: %s", e)

        return None


storage_service = StorageService()
