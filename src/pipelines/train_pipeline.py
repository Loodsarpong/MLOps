"""End-to-end training pipeline.

Config-driven: hyperparameters live in YAML and can be overridden on the CLI.
Each run logs params, metrics, and the joblib artifact to MLflow when
``tracking.enabled`` is true.
"""

from __future__ import annotations

import argparse
import logging
from dataclasses import dataclass
from pathlib import Path

from src.config import DEFAULT_CONFIG_PATH, PipelineConfig, load_config
from src.data.load import load_dataset
from src.models.train import TrainConfig, TrainResult, save_artifacts, train
from src.pipelines.tracking import (
    log_artifacts,
    log_metrics,
    log_params,
    mlflow_run,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PipelineResult:
    metrics: TrainResult
    model_path: Path
    metrics_path: Path


def _train_config_from(config: PipelineConfig) -> TrainConfig:
    return TrainConfig(
        test_size=config.training.test_size,
        random_state=config.training.random_state,
        max_iter=config.training.max_iter,
        regularisation_strength=config.training.regularisation_strength,
    )


def run(config: PipelineConfig) -> PipelineResult:
    train_cfg = _train_config_from(config)
    output_dir = Path(config.artifacts.output_dir)

    with mlflow_run(
        enabled=config.tracking.enabled,
        experiment_name=config.tracking.experiment_name,
        run_name=config.project.name,
    ):
        dataset = load_dataset(config.data.dataset)
        logger.info(
            "Loaded dataset %s (n_samples=%d, n_features=%d)",
            config.data.dataset,
            dataset.n_samples,
            dataset.n_features,
        )

        log_params(
            {
                "dataset": config.data.dataset,
                "test_size": train_cfg.test_size,
                "random_state": train_cfg.random_state,
                "max_iter": train_cfg.max_iter,
                "regularisation_strength": train_cfg.regularisation_strength,
            }
        )

        model, metrics = train(dataset, train_cfg)
        model_path, metrics_path = save_artifacts(model, metrics, output_dir)

        log_metrics({"accuracy": metrics.accuracy, "f1_macro": metrics.f1_macro})
        log_artifacts(output_dir)

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
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to the YAML config file.",
    )
    parser.add_argument(
        "--override",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help="Override a config value. Repeatable. Example: training.max_iter=2000",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    config = load_config(path=args.config, overrides=args.override)
    logging.basicConfig(
        level=config.logging.level.upper(),
        format="%(levelname)s %(name)s: %(message)s",
    )
    result = run(config)
    print(
        f"accuracy={result.metrics.accuracy:.4f} "
        f"f1_macro={result.metrics.f1_macro:.4f} "
        f"model={result.model_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
