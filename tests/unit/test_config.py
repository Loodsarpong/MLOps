"""Tests for src.config."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from src.config import PipelineConfig, load_config


def _write_config(path: Path) -> Path:
    path.write_text(
        "training:\n  test_size: 0.2\n  max_iter: 1000\ntracking:\n  enabled: true\n"
    )
    return path


def test_load_default_config_returns_expected_values() -> None:
    config = load_config()
    assert isinstance(config, PipelineConfig)
    assert config.project.name == "iris-baseline"
    assert config.data.dataset == "iris"
    assert config.training.max_iter == 1000
    assert config.tracking.enabled is True


def test_load_custom_config_path(tmp_path: Path) -> None:
    config_path = _write_config(tmp_path / "custom.yaml")
    config = load_config(path=config_path)
    assert config.training.max_iter == 1000
    assert config.training.test_size == 0.2


def test_overrides_apply_via_dotlist(tmp_path: Path) -> None:
    config_path = _write_config(tmp_path / "custom.yaml")
    config = load_config(
        path=config_path,
        overrides=["training.max_iter=2500", "tracking.enabled=false"],
    )
    assert config.training.max_iter == 2500
    assert config.tracking.enabled is False


def test_override_creates_missing_section(tmp_path: Path) -> None:
    config_path = _write_config(tmp_path / "custom.yaml")
    config = load_config(
        path=config_path,
        overrides=["artifacts.output_dir=/tmp/out"],
    )
    assert config.artifacts.output_dir == "/tmp/out"


def test_override_without_equals_raises(tmp_path: Path) -> None:
    config_path = _write_config(tmp_path / "custom.yaml")
    with pytest.raises(ValueError, match="Override must be"):
        load_config(path=config_path, overrides=["training.max_iter"])


def test_invalid_value_raises_validation_error(tmp_path: Path) -> None:
    config_path = _write_config(tmp_path / "custom.yaml")
    with pytest.raises(ValidationError):
        load_config(path=config_path, overrides=["training.test_size=1.5"])


def test_unknown_key_raises_validation_error(tmp_path: Path) -> None:
    config_path = _write_config(tmp_path / "custom.yaml")
    with pytest.raises(ValidationError):
        load_config(path=config_path, overrides=["training.unknown_field=42"])


def test_missing_config_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_config(path=tmp_path / "does-not-exist.yaml")
