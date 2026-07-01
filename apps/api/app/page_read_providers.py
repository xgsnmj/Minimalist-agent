from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, field_validator


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

    def list_configurations(self) -> list[PageReadProviderConfiguration]:
        return sorted(self._configurations.values(), key=lambda configuration: configuration.id)

    def get(self, configuration_id: int) -> PageReadProviderConfiguration:
        configuration = self._configurations.get(configuration_id)
        if configuration is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page Read Provider Configuration not found.",
            )
        return configuration

    def update(
        self,
        configuration_id: int,
        request: PageReadProviderUpdateRequest,
    ) -> PageReadProviderConfiguration:
        configuration = self.get(configuration_id)
        if request.provider_id is not None:
            configuration.provider_id = request.provider_id
        if request.name is not None:
            configuration.name = request.name
        if request.endpoint is not None:
            configuration.endpoint = request.endpoint
        if request.credential_reference is not None:
            configuration.credential_reference = request.credential_reference
        if request.timeout_seconds is not None:
            configuration.timeout_seconds = request.timeout_seconds
        if request.max_content_length is not None:
            configuration.max_content_length = request.max_content_length
        if request.allowed_domains is not None:
            configuration.allowed_domains = request.allowed_domains
        if request.enabled is not None:
            configuration.enabled = request.enabled
        return configuration

    def get_active_configuration(self) -> PageReadProviderConfiguration:
        for configuration in self.list_configurations():
            if configuration.enabled:
                return configuration
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Page Read provider is disabled.",
        )

    def get_provenance_configuration(self) -> PageReadProviderConfiguration:
        try:
            return self.get_active_configuration()
        except HTTPException:
            configurations = self.list_configurations()
            if configurations:
                return configurations[0]
            raise

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
