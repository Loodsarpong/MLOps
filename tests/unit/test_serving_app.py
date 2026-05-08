"""Tests for the FastAPI serving app."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.data.load import load_dataset
from src.models.train import TrainConfig, save_artifacts, train
from src.serving.app import create_app


@pytest.fixture(scope="module")
def trained_model_path(tmp_path_factory: pytest.TempPathFactory) -> Path:
    output = tmp_path_factory.mktemp("serve-model")
    dataset = load_dataset("iris")
    model, result = train(dataset, TrainConfig())
    model_path, _ = save_artifacts(model, result, output)
    return model_path


@pytest.fixture
def client(
    trained_model_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    monkeypatch.setenv("SERVING_MODEL_PATH", str(trained_model_path))
    with TestClient(create_app()) as test_client:
        yield test_client


def test_healthz_reports_model_loaded(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["model_loaded"] is True
    assert payload["model_path"].endswith("model.joblib")


def test_predict_returns_predictions_and_probabilities(client: TestClient) -> None:
    payload = {"features": [[5.1, 3.5, 1.4, 0.2], [6.7, 3.0, 5.2, 2.3]]}
    response = client.post("/predict", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert body["predictions"] == [0, 2]
    assert body["probabilities"] is not None
    assert len(body["probabilities"]) == 2
    for row in body["probabilities"]:
        assert len(row) == 3
        assert sum(row) == pytest.approx(1.0, abs=1e-6)


def test_predict_rejects_empty_batch(client: TestClient) -> None:
    response = client.post("/predict", json={"features": []})
    assert response.status_code == 422


def test_predict_rejects_wrong_feature_count(client: TestClient) -> None:
    response = client.post("/predict", json={"features": [[1.0, 2.0]]})
    assert response.status_code == 422


def test_healthz_when_model_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SERVING_MODEL_PATH", str(tmp_path / "missing.joblib"))
    with TestClient(create_app()) as test_client:
        response = test_client.get("/healthz")
    assert response.status_code == 200
    body = response.json()
    assert body["model_loaded"] is False


def test_predict_returns_503_when_model_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SERVING_MODEL_PATH", str(tmp_path / "missing.joblib"))
    with TestClient(create_app()) as test_client:
        response = test_client.post(
            "/predict", json={"features": [[5.1, 3.5, 1.4, 0.2]]}
        )
    assert response.status_code == 503
