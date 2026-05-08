"""MLflow integration for training pipelines.

All public helpers are no-ops when tracking is disabled or no run is active,
so callers can sprinkle ``log_*`` calls without conditionals.
"""

from __future__ import annotations

import logging
import subprocess
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import mlflow

logger = logging.getLogger(__name__)


def _resolve_git_commit() -> str | None:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


@contextmanager
def mlflow_run(
    *,
    enabled: bool,
    experiment_name: str,
    run_name: str | None = None,
) -> Iterator[Any]:
    """Start an MLflow run if tracking is enabled, otherwise yield ``None``."""
    if not enabled:
        logger.info("Tracking disabled; skipping MLflow run")
        yield None
        return

    mlflow.set_experiment(experiment_name)
    with mlflow.start_run(run_name=run_name) as run:
        commit = _resolve_git_commit()
        if commit is not None:
            mlflow.set_tag("git_commit", commit)
        if run_name is not None:
            mlflow.set_tag("run_name", run_name)
        yield run


def log_params(params: Mapping[str, Any]) -> None:
    if mlflow.active_run() is None:
        return
    mlflow.log_params(dict(params))


def log_metrics(metrics: Mapping[str, float]) -> None:
    if mlflow.active_run() is None:
        return
    mlflow.log_metrics(dict(metrics))


def log_artifacts(directory: Path) -> None:
    if mlflow.active_run() is None:
        return
    mlflow.log_artifacts(str(directory))
