from __future__ import annotations

from typing import Generic, TypeVar

from fastapi import HTTPException, status


ConfigurationT = TypeVar("ConfigurationT")


class ProviderConfigurationStore(Generic[ConfigurationT]):
    def __init__(
        self,
        *,
        configurations: dict[int, ConfigurationT],
        not_found_detail: str,
        disabled_detail: str,
    ) -> None:
        self._configurations = configurations
        self._not_found_detail = not_found_detail
        self._disabled_detail = disabled_detail

    def list_configurations(self) -> list[ConfigurationT]:
        return sorted(
            self._configurations.values(),
            key=lambda configuration: getattr(configuration, "id"),
        )

    def get(self, configuration_id: int) -> ConfigurationT:
        configuration = self._configurations.get(configuration_id)
        if configuration is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=self._not_found_detail,
            )
        return configuration

    def update(
        self,
        configuration_id: int,
        request: object,
        *,
        fields: tuple[str, ...],
    ) -> ConfigurationT:
        configuration = self.get(configuration_id)
        for field in fields:
            value = getattr(request, field, None)
            if value is not None:
                setattr(configuration, field, value)
        return configuration

    def get_active_configuration(self) -> ConfigurationT:
        for configuration in self.list_configurations():
            if getattr(configuration, "enabled"):
                return configuration
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=self._disabled_detail,
        )

    def get_provenance_configuration(self) -> ConfigurationT:
        try:
            return self.get_active_configuration()
        except HTTPException:
            configurations = self.list_configurations()
            if configurations:
                return configurations[0]
            raise
