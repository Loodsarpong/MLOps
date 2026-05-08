"""End-to-end training pipeline.

Wires data loading, feature engineering, training, evaluation, and artifact
persistence. MLflow integration is intentionally deferred until a tracking
server is provisioned.
"""

from __future__ import annotations

import argparse
import logging
from dataclasses import dataclass
from pathlib import Path

from src.data.load import DatasetName, load_dataset
from src.models.train import TrainConfig, TrainResult, save_artifacts, train

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PipelineResult:
    metrics: TrainResult
    model_path: Path
    metrics_path: Path


def run(
    output_dir: Path,
    dataset_name: DatasetName = "iris",
    config: TrainConfig | None = None,
) -> PipelineResult:
    config = config or TrainConfig()
    dataset = load_dataset(dataset_name)
    logger.info(
        "Loaded dataset %s (n_samples=%d, n_features=%d)",
        dataset_name,
        dataset.n_samples,
        dataset.n_features,
    )
    model, metrics = train(dataset, config)
    model_path, metrics_path = save_artifacts(model, metrics, output_dir)
    logger.info(
        "Training complete: accuracy=%.4f f1_macro=%.4f",
        metrics.accuracy,
        metrics.f1_macro,
    )
    return PipelineResult(
        metrics=metrics,
        model_path=model_path,
        metrics_path=metrics_path,
    )


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the training pipeline.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("models/iris"),
        help="Directory to write model + metrics artifacts.",
    )
    parser.add_argument(
        "--dataset",
        choices=["iris"],
        default="iris",
        help="Dataset to train on.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )
    args = _build_arg_parser().parse_args(argv)
    result = run(output_dir=args.output_dir, dataset_name=args.dataset)
    print(
        f"accuracy={result.metrics.accuracy:.4f} "
        f"f1_macro={result.metrics.f1_macro:.4f} "
        f"model={result.model_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
