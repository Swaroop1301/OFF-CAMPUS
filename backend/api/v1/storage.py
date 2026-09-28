"""
Object storage API endpoints — upload, download, and artifact retrieval.
"""

from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Response
from pydantic import BaseModel

from services.storage_service import storage_service, BUCKETS

router = APIRouter()


class UploadResponse(BaseModel):
    bucket: str
    path: str
    uri: str
    size_bytes: int


@router.get("/buckets", response_model=List[str])
async def list_buckets():
    """Returns available storage buckets."""
    return BUCKETS


@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    bucket: str = Form(...),
    path: str = Form(...),
    file: UploadFile = File(...)
):
    """Upload an artifact to object storage."""
    if bucket not in BUCKETS:
        raise HTTPException(status_code=400, detail=f"Invalid bucket. Must be one of {BUCKETS}")

    content = await file.read()
    uri = await storage_service.save_artifact(
        bucket=bucket,
        path=path,
        content=content,
        content_type=file.content_type or "application/octet-stream"
    )

    return UploadResponse(
        bucket=bucket,
        path=path,
        uri=uri,
        size_bytes=len(content)
    )


@router.get("/{bucket}/{file_path:path}")
async def download_file(bucket: str, file_path: str):
    """Download an artifact from object storage."""
    if bucket not in BUCKETS:
        raise HTTPException(status_code=400, detail=f"Invalid bucket: {bucket}")

    data = await storage_service.get_artifact(bucket, file_path)
    if not data:
        raise HTTPException(status_code=404, detail="Artifact not found")

    content_type = "application/octet-stream"
    if file_path.endswith(".json"):
        content_type = "application/json"
    elif file_path.endswith(".csv"):
        content_type = "text/csv"
    elif file_path.endswith(".pdf"):
        content_type = "application/pdf"
    elif file_path.endswith(".cas") or file_path.endswith(".dat"):
        content_type = "application/x-ansys"

    return Response(content=data, media_type=content_type)
