"""Tests for src.data.load."""

from __future__ import annotations

import pytest

from src.data.load import load_dataset


def test_load_iris_returns_expected_shape() -> None:
    dataset = load_dataset("iris")
    assert dataset.n_samples == 150
    assert dataset.n_features == 4
    assert dataset.features.shape == (150, 4)
    assert dataset.target.shape == (150,)
    assert len(dataset.feature_names) == 4
    assert set(dataset.target_names) == {"setosa", "versicolor", "virginica"}


def test_load_iris_target_classes() -> None:
    dataset = load_dataset("iris")
    assert set(dataset.target.tolist()) == {0, 1, 2}


def test_unknown_dataset_raises() -> None:
    with pytest.raises(ValueError, match="Unknown dataset"):
        load_dataset("does-not-exist")  # type: ignore[arg-type]
