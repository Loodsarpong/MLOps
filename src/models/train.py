"""Training and evaluation."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from src.data.load import Dataset
from src.features.build import build_feature_pipeline


@dataclass(frozen=True)
class TrainConfig:
    test_size: float = 0.2
    random_state: int = 42
    max_iter: int = 1000
    regularisation_strength: float = 1.0


@dataclass(frozen=True)
class TrainResult:
    accuracy: float
    f1_macro: float
    n_train: int
    n_test: int


def build_model(config: TrainConfig) -> Pipeline:
    feature_pipeline = build_feature_pipeline()
    classifier = LogisticRegression(
        max_iter=config.max_iter,
        C=config.regularisation_strength,
        random_state=config.random_state,
    )
    return Pipeline([*feature_pipeline.steps, ("classifier", classifier)])


def train(dataset: Dataset, config: TrainConfig) -> tuple[Pipeline, TrainResult]:
    x_train, x_test, y_train, y_test = train_test_split(
        dataset.features,
        dataset.target,
        test_size=config.test_size,
        random_state=config.random_state,
        stratify=dataset.target,
    )
    model = build_model(config)
    model.fit(x_train, y_train)
    preds = model.predict(x_test)
    return model, TrainResult(
        accuracy=float(accuracy_score(y_test, preds)),
        f1_macro=float(f1_score(y_test, preds, average="macro")),
        n_train=int(x_train.shape[0]),
        n_test=int(x_test.shape[0]),
    )


def save_artifacts(
    model: Pipeline,
    result: TrainResult,
    output_dir: Path,
) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    model_path = output_dir / "model.joblib"
    metrics_path = output_dir / "metrics.json"
    joblib.dump(model, model_path)
    metrics_path.write_text(json.dumps(asdict(result), indent=2) + "\n")
    return model_path, metrics_path
