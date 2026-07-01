from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from io import BytesIO
from typing import Protocol

from minio import Minio


@dataclass
class StoredObject:
    bucket: str
    object_key: str
    content_type: str
    size: int


class ObjectStorage(Protocol):
    def put_bytes(
        self,
        *,
        bucket: str,
        object_key: str,
        content: bytes,
        content_type: str,
    ) -> StoredObject: ...

    def get_bytes(self, *, bucket: str, object_key: str) -> bytes: ...


class InMemoryObjectStorage:
    def __init__(self) -> None:
        self._objects: dict[tuple[str, str], tuple[bytes, str]] = {}

    def reset(self) -> None:
        self._objects.clear()

    def put_bytes(
        self,
        *,
        bucket: str,
        object_key: str,
        content: bytes,
        content_type: str,
    ) -> StoredObject:
        self._objects[(bucket, object_key)] = (content, content_type)
        return StoredObject(
            bucket=bucket,
            object_key=object_key,
            content_type=content_type,
            size=len(content),
        )

    def get_bytes(self, *, bucket: str, object_key: str) -> bytes:
        payload = self._objects.get((bucket, object_key))
        if payload is None:
            raise KeyError(object_key)
        return payload[0]

    def get_text(self, *, bucket: str, object_key: str) -> str:
        return self.get_bytes(bucket=bucket, object_key=object_key).decode("utf-8", errors="replace")


class MinioObjectStorage:
    def __init__(self, client: Minio) -> None:
        self._client = client

    def put_bytes(
        self,
        *,
        bucket: str,
        object_key: str,
        content: bytes,
        content_type: str,
    ) -> StoredObject:
        if not self._client.bucket_exists(bucket):
            self._client.make_bucket(bucket)
        self._client.put_object(
            bucket,
            object_key,
            data=BytesIO(content),
            length=len(content),
            content_type=content_type,
        )
        return StoredObject(
            bucket=bucket,
            object_key=object_key,
            content_type=content_type,
            size=len(content),
        )

    def get_bytes(self, *, bucket: str, object_key: str) -> bytes:
        response = self._client.get_object(bucket, object_key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def get_text(self, *, bucket: str, object_key: str) -> str:
        return self.get_bytes(bucket=bucket, object_key=object_key).decode("utf-8", errors="replace")


def build_object_storage() -> ObjectStorage:
    endpoint = os.getenv("MINIO_ENDPOINT", "")
    access_key = os.getenv("MINIO_ACCESS_KEY", "")
    secret_key = os.getenv("MINIO_SECRET_KEY", "")
    if endpoint and access_key and secret_key:
        secure = os.getenv("MINIO_SECURE", "false").lower() == "true"
        client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)
        return MinioObjectStorage(client)
    return InMemoryObjectStorage()


def _decode_base64(data: str) -> bytes:
    return base64.b64decode(data.encode("utf-8"))


object_storage = build_object_storage()
