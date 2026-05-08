"""Tests for src.pipelines.train_pipeline."""

from __future__ import annotations

from pathlib import Path

import mlflow
import pytest

from src.config import PipelineConfig, load_config
from src.pipelines.train_pipeline import main, run


def _config_for(tmp_path: Path, *, tracking_enabled: bool = False) -> PipelineConfig:
    config = load_config()
    config.artifacts.output_dir = str(tmp_path / "iris")
    config.tracking.enabled = tracking_enabled
    config.tracking.experiment_name = "unit-test"
    return config


def test_run_pipeline_writes_artifacts(tmp_path: Path) -> None:
    result = run(_config_for(tmp_path))
    assert result.model_path == tmp_path / "iris" / "model.joblib"
    assert result.metrics_path == tmp_path / "iris" / "metrics.json"
    assert result.model_path.exists()
    assert result.metrics_path.exists()
    assert result.metrics.accuracy >= 0.9


def test_run_pipeline_logs_to_mlflow_when_enabled(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    tracking_uri = f"file://{tmp_path / 'mlruns'}"
    monkeypatch.setenv("MLFLOW_TRACKING_URI", tracking_uri)
    mlflow.set_tracking_uri(tracking_uri)

    run(_config_for(tmp_path, tracking_enabled=True))

    runs = mlflow.search_runs(experiment_names=["unit-test"])
    assert not runs.empty
    last = runs.iloc[0]
    assert last["metrics.accuracy"] >= 0.9
    assert last["params.max_iter"] == "1000"


def test_overrides_apply_through_pipeline(tmp_path: Path) -> None:
    config = _config_for(tmp_path)
    config.training.max_iter = 50
    result = run(config)
    assert result.metrics.accuracy >= 0.7


def test_main_cli_runs(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("MLFLOW_TRACKING_URI", f"file://{tmp_path / 'mlruns'}")
    output_dir = tmp_path / "cli-out"

    exit_code = main(
        [
            "--override",
            f"artifacts.output_dir={output_dir}",
            "--override",
            "tracking.enabled=false",
        ]
    )

    assert exit_code == 0
    captured = capsys.readouterr()
    assert "accuracy=" in captured.out
    assert (output_dir / "model.joblib").exists()
