from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, field_validator

from apps.api.app.provider_configurations import ProviderConfigurationStore


class PageReadProviderId(StrEnum):
    JINA_READER = "jina_reader"


class PageReadProviderUpdateRequest(BaseModel):
    provider_id: PageReadProviderId | None = None
    name: str | None = Field(default=None, min_length=1, max_length=160)
    endpoint: str | None = Field(default=None, min_length=1, max_length=2048)
    credential_reference: str | None = Field(default=None, min_length=1, max_length=240)
    timeout_seconds: int | None = Field(default=None, ge=1, le=120)
    max_content_length: int | None = Field(default=None, ge=120, le=20000)
    allowed_domains: list[str] | None = None
    enabled: bool | None = None

    @field_validator("endpoint")
    @classmethod
    def validate_endpoint(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(("https://", "http://")):
            raise ValueError("Page Read Provider endpoint must be remote HTTP(S).")
        return value

    @field_validator("allowed_domains")
    @classmethod
    def validate_allowed_domains(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        normalized_domains = []
        for domain in value:
            normalized_domain = domain.strip().lower()
            if not normalized_domain:
                raise ValueError("Allowed domain cannot be empty.")
            normalized_domains.append(normalized_domain)
        return normalized_domains


class PageReadProviderResponse(BaseModel):
    id: int
    provider_id: PageReadProviderId
    name: str
    endpoint: str
    credential_reference: str
    timeout_seconds: int
    max_content_length: int
    allowed_domains: list[str]
    enabled: bool


class PageReadExecutionResponse(BaseModel):
    provider_id: PageReadProviderId
    provider_name: str
    url: str
    title: str
    summary: str
    content: str
    content_length: int


@dataclass
class PageReadProviderConfiguration:
    id: int
    provider_id: PageReadProviderId
    name: str
    endpoint: str
    credential_reference: str
    timeout_seconds: int
    max_content_length: int
    allowed_domains: list[str]
    enabled: bool = True


@dataclass
class PageReadExecution:
    provider_id: PageReadProviderId
    provider_name: str
    url: str
    title: str
    summary: str
    content: str


class PageReadProviderStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self._configurations: dict[int, PageReadProviderConfiguration] = {
            1: PageReadProviderConfiguration(
                id=1,
                provider_id=PageReadProviderId.JINA_READER,
                name="Jina Reader Provider",
                endpoint="https://r.jina.ai/http://example.com",
                credential_reference="secret:jina-reader",
                timeout_seconds=20,
                max_content_length=4000,
                allowed_domains=[],
                enabled=True,
            )
        }
        self._store = ProviderConfigurationStore(
            configurations=self._configurations,
            not_found_detail="Page Read Provider Configuration not found.",
            disabled_detail="Page Read provider is disabled.",
        )

    def list_configurations(self) -> list[PageReadProviderConfiguration]:
        return self._store.list_configurations()

    def get(self, configuration_id: int) -> PageReadProviderConfiguration:
        return self._store.get(configuration_id)

    def update(
        self,
        configuration_id: int,
        request: PageReadProviderUpdateRequest,
    ) -> PageReadProviderConfiguration:
        return self._store.update(
            configuration_id,
            request,
            fields=(
                "provider_id",
                "name",
                "endpoint",
                "credential_reference",
                "timeout_seconds",
                "max_content_length",
                "allowed_domains",
                "enabled",
            ),
        )

    def get_active_configuration(self) -> PageReadProviderConfiguration:
        return self._store.get_active_configuration()

    def get_provenance_configuration(self) -> PageReadProviderConfiguration:
        return self._store.get_provenance_configuration()

    def read(self, url: str) -> PageReadExecution:
        if not url.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Page Read URL is required.",
            )
        parsed_url = urlparse(url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Page Read URL must be HTTP(S).",
            )

        configuration = self.get_active_configuration()
        if configuration.provider_id != PageReadProviderId.JINA_READER:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Jina Reader Provider is unavailable.",
            )
        if not self._is_domain_allowed(configuration, parsed_url.hostname or ""):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="URL is outside the Page Read Provider domain policy.",
            )

        content = self._build_mock_content(url)[: configuration.max_content_length]
        title = f"Readable content from {parsed_url.netloc}"
        summary = (
            f"{configuration.name} read {url} and returned "
            f"{len(content)} characters."
        )
        return PageReadExecution(
            provider_id=configuration.provider_id,
            provider_name=configuration.name,
            url=url,
            title=title,
            summary=summary,
            content=content,
        )

    def _is_domain_allowed(
        self,
        configuration: PageReadProviderConfiguration,
        hostname: str,
    ) -> bool:
        if not configuration.allowed_domains:
            return True
        normalized_hostname = hostname.lower()
        return any(
            normalized_hostname == domain
            or normalized_hostname.endswith(f".{domain}")
            for domain in configuration.allowed_domains
        )

    def _build_mock_content(self, url: str) -> str:
        return (
            f"Mock readable content extracted from {url}. "
            "This content represents the body text that Jina Reader would return "
            "for a known URL through Page Read Capability. "
        ) * 8


def to_page_read_provider_response(
    configuration: PageReadProviderConfiguration,
) -> PageReadProviderResponse:
    return PageReadProviderResponse(
        id=configuration.id,
        provider_id=configuration.provider_id,
        name=configuration.name,
        endpoint=configuration.endpoint,
        credential_reference=configuration.credential_reference,
        timeout_seconds=configuration.timeout_seconds,
        max_content_length=configuration.max_content_length,
        allowed_domains=list(configuration.allowed_domains),
        enabled=configuration.enabled,
    )


def to_page_read_execution_response(
    execution: PageReadExecution,
) -> PageReadExecutionResponse:
    return PageReadExecutionResponse(
        provider_id=execution.provider_id,
        provider_name=execution.provider_name,
        url=execution.url,
        title=execution.title,
        summary=execution.summary,
        content=execution.content,
        content_length=len(execution.content),
    )


page_read_provider_store = PageReadProviderStore()
