from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, field_validator


class SearchProviderId(StrEnum):
    DOUBAO = "doubao"


class SearchProviderMutationRequest(BaseModel):
    provider_id: SearchProviderId = SearchProviderId.DOUBAO
    name: str = Field(min_length=1, max_length=160)
    endpoint: str = Field(min_length=1, max_length=2048)
    credential_reference: str = Field(min_length=1, max_length=240)
    timeout_seconds: int = Field(default=20, ge=1, le=120)
    max_results: int = Field(default=5, ge=1, le=20)
    enabled: bool = True

    @field_validator("endpoint")
    @classmethod
    def validate_endpoint(cls, value: str) -> str:
        if not value.startswith(("https://", "http://")):
            raise ValueError("Search provider endpoint must be remote HTTP(S).")
        return value


class SearchProviderUpdateRequest(BaseModel):
    provider_id: SearchProviderId | None = None
    name: str | None = Field(default=None, min_length=1, max_length=160)
    endpoint: str | None = Field(default=None, min_length=1, max_length=2048)
    credential_reference: str | None = Field(default=None, min_length=1, max_length=240)
    timeout_seconds: int | None = Field(default=None, ge=1, le=120)
    max_results: int | None = Field(default=None, ge=1, le=20)
    enabled: bool | None = None

    @field_validator("endpoint")
    @classmethod
    def validate_endpoint(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(("https://", "http://")):
            raise ValueError("Search provider endpoint must be remote HTTP(S).")
        return value


class SearchProviderResponse(BaseModel):
    id: int
    provider_id: SearchProviderId
    name: str
    endpoint: str
    credential_reference: str
    timeout_seconds: int
    max_results: int
    enabled: bool


class SearchResultItemResponse(BaseModel):
    title: str
    url: str
    snippet: str


class SearchExecutionResponse(BaseModel):
    provider_id: SearchProviderId
    provider_name: str
    query: str
    summary: str
    result_summaries: list[str]
    results: list[SearchResultItemResponse]


@dataclass
class SearchProviderConfiguration:
    id: int
    provider_id: SearchProviderId
    name: str
    endpoint: str
    credential_reference: str
    timeout_seconds: int
    max_results: int
    enabled: bool = True


@dataclass
class SearchResultItem:
    title: str
    url: str
    snippet: str


@dataclass
class SearchExecution:
    provider_id: SearchProviderId
    provider_name: str
    query: str
    summary: str
    result_summaries: list[str]
    results: list[SearchResultItem]


class SearchProviderStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self._next_id = 2
        self._configurations: dict[int, SearchProviderConfiguration] = {
            1: SearchProviderConfiguration(
                id=1,
                provider_id=SearchProviderId.DOUBAO,
                name="Doubao Search Provider",
                endpoint="https://api.doubao.example/search",
                credential_reference="secret:doubao-search",
                timeout_seconds=20,
                max_results=5,
                enabled=True,
            )
        }

    def list_configurations(self) -> list[SearchProviderConfiguration]:
        return sorted(self._configurations.values(), key=lambda configuration: configuration.id)

    def get(self, configuration_id: int) -> SearchProviderConfiguration:
        configuration = self._configurations.get(configuration_id)
        if configuration is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Search Provider Configuration not found.",
            )
        return configuration

    def update(
        self,
        configuration_id: int,
        request: SearchProviderUpdateRequest,
    ) -> SearchProviderConfiguration:
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
        if request.max_results is not None:
            configuration.max_results = request.max_results
        if request.enabled is not None:
            configuration.enabled = request.enabled
        return configuration

    def get_active_configuration(self) -> SearchProviderConfiguration:
        for configuration in self.list_configurations():
            if configuration.enabled:
                return configuration
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search provider is disabled.",
        )

    def get_provenance_configuration(self) -> SearchProviderConfiguration:
        try:
            return self.get_active_configuration()
        except HTTPException:
            configurations = self.list_configurations()
            if configurations:
                return configurations[0]
            raise

    def search(self, query: str) -> SearchExecution:
        if not query.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Search query is required.",
            )
        configuration = self.get_active_configuration()
        if configuration.provider_id != SearchProviderId.DOUBAO:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Doubao Search Provider is unavailable.",
            )

        raw_results = self._build_mock_results(configuration, query)
        results = raw_results[: configuration.max_results]
        result_summaries = [result.snippet for result in results]
        summary = (
            f"{configuration.name} returned {len(results)} results for "
            f"\"{query}\"."
        )
        return SearchExecution(
            provider_id=configuration.provider_id,
            provider_name=configuration.name,
            query=query,
            summary=summary,
            result_summaries=result_summaries,
            results=results,
        )

    def _build_mock_results(
        self,
        configuration: SearchProviderConfiguration,
        query: str,
    ) -> list[SearchResultItem]:
        normalized_query = "-".join(query.lower().split()[:4]) or "search"
        return [
            SearchResultItem(
                title=f"{configuration.name} result {index + 1}",
                url=f"{configuration.endpoint.rstrip('/')}/{normalized_query}/{index + 1}",
                snippet=f"Mock result {index + 1} for {query}.",
            )
            for index in range(3)
        ]


def to_search_provider_response(
    configuration: SearchProviderConfiguration,
) -> SearchProviderResponse:
    return SearchProviderResponse(
        id=configuration.id,
        provider_id=configuration.provider_id,
        name=configuration.name,
        endpoint=configuration.endpoint,
        credential_reference=configuration.credential_reference,
        timeout_seconds=configuration.timeout_seconds,
        max_results=configuration.max_results,
        enabled=configuration.enabled,
    )


def to_search_execution_response(execution: SearchExecution) -> SearchExecutionResponse:
    return SearchExecutionResponse(
        provider_id=execution.provider_id,
        provider_name=execution.provider_name,
        query=execution.query,
        summary=execution.summary,
        result_summaries=execution.result_summaries,
        results=[
            SearchResultItemResponse(
                title=result.title,
                url=result.url,
                snippet=result.snippet,
            )
            for result in execution.results
        ],
    )


search_provider_store = SearchProviderStore()
