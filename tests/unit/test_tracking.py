"""Tests for src.pipelines.tracking."""

from __future__ import annotations

from pathlib import Path

import mlflow
import pytest

from src.pipelines.tracking import (
    log_artifacts,
    log_metrics,
    log_params,
    mlflow_run,
)


@pytest.fixture
def mlflow_tmp(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    tracking_uri = f"file://{tmp_path / 'mlruns'}"
    monkeypatch.setenv("MLFLOW_TRACKING_URI", tracking_uri)
    mlflow.set_tracking_uri(tracking_uri)
    return tmp_path


def test_disabled_run_yields_none() -> None:
    with mlflow_run(enabled=False, experiment_name="x") as run:
        assert run is None


def test_enabled_run_logs_params_metrics_and_artifacts(
    mlflow_tmp: Path,
) -> None:
    artifacts = mlflow_tmp / "artifacts"
    artifacts.mkdir()
    (artifacts / "metrics.json").write_text('{"accuracy": 0.9}')

    with mlflow_run(
        enabled=True,
        experiment_name="unit-test",
        run_name="case-1",
    ) as run:
        assert run is not None
        run_id = run.info.run_id
        log_params({"max_iter": 1000, "C": 1.0})
        log_metrics({"accuracy": 0.9, "f1_macro": 0.88})
        log_artifacts(artifacts)

    finished = mlflow.get_run(run_id)
    assert finished.data.params["max_iter"] == "1000"
    assert finished.data.metrics["accuracy"] == pytest.approx(0.9)
    assert finished.data.tags.get("run_name") == "case-1"


def test_log_helpers_are_noops_outside_active_run(mlflow_tmp: Path) -> None:
    log_params({"foo": 1})
    log_metrics({"bar": 0.5})
    log_artifacts(mlflow_tmp)
