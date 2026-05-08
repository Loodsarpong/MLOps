"""Tests for src.pipelines.train_pipeline."""

from __future__ import annotations

from pathlib import Path

from src.pipelines.train_pipeline import main, run


def test_run_pipeline_writes_artifacts(tmp_path: Path) -> None:
    output_dir = tmp_path / "iris"
    result = run(output_dir=output_dir)

    assert result.model_path == output_dir / "model.joblib"
    assert result.metrics_path == output_dir / "metrics.json"
    assert result.model_path.exists()
    assert result.metrics_path.exists()
    assert result.metrics.accuracy >= 0.9


def test_main_cli_runs(tmp_path: Path, capsys) -> None:
    output_dir = tmp_path / "cli-out"
    exit_code = main(["--output-dir", str(output_dir)])

    assert exit_code == 0
    captured = capsys.readouterr()
    assert "accuracy=" in captured.out
    assert (output_dir / "model.joblib").exists()
