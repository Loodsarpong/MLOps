"""Tests for src.features.build."""

from __future__ import annotations

import numpy as np

from src.features.build import build_feature_pipeline


def test_pipeline_standardises_features() -> None:
    rng = np.random.default_rng(seed=0)
    x = rng.normal(loc=10.0, scale=3.0, size=(200, 4))

    pipeline = build_feature_pipeline()
    transformed = pipeline.fit_transform(x)

    np.testing.assert_allclose(transformed.mean(axis=0), 0.0, atol=1e-7)
    np.testing.assert_allclose(transformed.std(axis=0), 1.0, atol=1e-2)


def test_pipeline_has_scaler_step() -> None:
    pipeline = build_feature_pipeline()
    assert [name for name, _ in pipeline.steps] == ["scaler"]
