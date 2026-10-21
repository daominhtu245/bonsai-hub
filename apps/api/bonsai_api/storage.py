"""Cloudflare R2 qua S3 API. Bucket private; mọi truy cập bằng URL ký sẵn (mặc định 1 giờ)."""

from __future__ import annotations

from functools import lru_cache

import boto3
from botocore.config import Config

from .settings import get_settings


@lru_cache
def _s3(public: bool = False):
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=(s.r2_public_endpoint or s.r2_endpoint) if public else s.r2_endpoint,
        aws_access_key_id=s.r2_access_key_id,
        aws_secret_access_key=s.r2_secret_access_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def presign_put(key: str, content_type: str) -> str:
    s = get_settings()
    return _s3(public=True).generate_presigned_url(
        "put_object",
        Params={"Bucket": s.r2_bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=s.presign_ttl_seconds,
    )


def presign_get(key: str) -> str:
    s = get_settings()
    return _s3(public=True).generate_presigned_url(
        "get_object", Params={"Bucket": s.r2_bucket, "Key": key}, ExpiresIn=s.presign_ttl_seconds
    )


def head(key: str) -> dict | None:
    from botocore.exceptions import ClientError

    try:
        return _s3().head_object(Bucket=get_settings().r2_bucket, Key=key)
    except ClientError:
        return None


def job_image_key(tree_id, job_id, stage: str, attempt: int) -> str:
    return f"trees/{tree_id}/jobs/{job_id}/{stage}_{attempt}.webp"


def get_bytes(key: str) -> bytes:
    return _s3().get_object(Bucket=get_settings().r2_bucket, Key=key)["Body"].read()


def put_bytes(key: str, data: bytes, content_type: str) -> None:
    _s3().put_object(Bucket=get_settings().r2_bucket, Key=key, Body=data, ContentType=content_type)


def delete(key: str) -> None:
    _s3().delete_object(Bucket=get_settings().r2_bucket, Key=key)


def tree_photo_key(tree_id, photo_id) -> str:
    return f"trees/{tree_id}/photos/{photo_id}.webp"
