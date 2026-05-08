"""Tests for src.models.train."""

from __future__ import annotations

import json
from pathlib import Path

import joblib

from src.data.load import load_dataset
from src.models.train import TrainConfig, save_artifacts, train


def test_train_meets_accuracy_threshold() -> None:
    dataset = load_dataset("iris")
    _, result = train(dataset, TrainConfig())

    assert result.n_train + result.n_test == dataset.n_samples
    assert result.accuracy >= 0.9
    assert result.f1_macro >= 0.9


def test_train_is_deterministic() -> None:
    dataset = load_dataset("iris")
    _, first = train(dataset, TrainConfig(random_state=7))
    _, second = train(dataset, TrainConfig(random_state=7))
    assert first == second


def test_save_artifacts_writes_model_and_metrics(tmp_path: Path) -> None:
    dataset = load_dataset("iris")
    model, result = train(dataset, TrainConfig())

    model_path, metrics_path = save_artifacts(model, result, tmp_path / "out")

    assert model_path.exists()
    assert metrics_path.exists()
    metrics = json.loads(metrics_path.read_text())
    assert metrics["accuracy"] == result.accuracy
    assert metrics["f1_macro"] == result.f1_macro

    loaded = joblib.load(model_path)
    preds = loaded.predict(dataset.features[:5])
    assert preds.shape == (5,)
