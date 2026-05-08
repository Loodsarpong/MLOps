"""Pipeline configuration.

Typed pydantic models loaded from YAML with optional CLI ``key=value`` overrides.
Replaces a heavier OmegaConf/Hydra setup; pydantic gives us validation +
editor autocomplete for free, and we already use it for the serving API.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

DEFAULT_CONFIG_PATH = Path("configs/default.yaml")


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=False)


class ProjectConfig(_StrictModel):
    name: str = "iris-baseline"
    seed: int = 42


class DataConfig(_StrictModel):
    dataset: Literal["iris"] = "iris"
    raw_dir: str = "data/raw"
    processed_dir: str = "data/processed"
    external_dir: str = "data/external"


class TrainingConfig(_StrictModel):
    test_size: float = Field(0.2, gt=0.0, lt=1.0)
    random_state: int = 42
    max_iter: int = Field(1000, gt=0)
    regularisation_strength: float = Field(1.0, gt=0.0)


class ArtifactsConfig(_StrictModel):
    output_dir: str = "models/iris"


class TrackingConfig(_StrictModel):
    enabled: bool = True
    experiment_name: str = "iris-baseline"


class LoggingConfig(_StrictModel):
    level: str = "INFO"


class PipelineConfig(_StrictModel):
    project: ProjectConfig = ProjectConfig()
    data: DataConfig = DataConfig()
    training: TrainingConfig = TrainingConfig()
    artifacts: ArtifactsConfig = ArtifactsConfig()
    tracking: TrackingConfig = TrackingConfig()
    logging: LoggingConfig = LoggingConfig()


def _coerce_scalar(value: str) -> bool | int | float | str | None:
    lowered = value.lower()
    if lowered in ("true", "false"):
        return lowered == "true"
    if lowered in ("null", "none", "~"):
        return None
    try:
        return int(value)
    except ValueError:
        pass
    try:
        return float(value)
    except ValueError:
        pass
    return value


def _apply_overrides(data: dict[str, Any], overrides: Sequence[str]) -> dict[str, Any]:
    for raw in overrides:
        if "=" not in raw:
            raise ValueError(f"Override must be 'key=value', got {raw!r}")
        key, _, value = raw.partition("=")
        parts = key.split(".")
        cursor: dict[str, Any] = data
        for part in parts[:-1]:
            existing = cursor.get(part)
            if not isinstance(existing, dict):
                existing = {}
                cursor[part] = existing
            cursor = existing
        cursor[parts[-1]] = _coerce_scalar(value)
    return data


def load_config(
    path: Path | None = None,
    overrides: Sequence[str] | None = None,
) -> PipelineConfig:
    """Load a YAML config and apply optional ``key=value`` overrides."""
    config_path = path or DEFAULT_CONFIG_PATH
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with config_path.open() as fh:
        raw = yaml.safe_load(fh) or {}
    if not isinstance(raw, dict):
        raise TypeError(
            f"Top-level config in {config_path} must be a mapping, "
            f"got {type(raw).__name__}"
        )
    if overrides:
        raw = _apply_overrides(raw, list(overrides))
    return PipelineConfig.model_validate(raw)
