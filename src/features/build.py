"""Feature engineering primitives."""

from __future__ import annotations

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


def build_feature_pipeline() -> Pipeline:
    """Return the standard feature-preprocessing pipeline.

    Centralised so training and serving use identical preprocessing.
    """
    return Pipeline([("scaler", StandardScaler())])
