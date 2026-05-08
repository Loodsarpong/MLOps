"""Dataset loaders.

Each loader returns a :class:`Dataset` so downstream code does not depend on
sklearn's ``Bunch`` type.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
from numpy.typing import NDArray
from sklearn.datasets import load_iris

DatasetName = Literal["iris"]


@dataclass(frozen=True)
class Dataset:
    features: NDArray[np.float64]
    target: NDArray[Any]
    feature_names: tuple[str, ...]
    target_names: tuple[str, ...]

    @property
    def n_samples(self) -> int:
        return int(self.features.shape[0])

    @property
    def n_features(self) -> int:
        return int(self.features.shape[1])


def load_dataset(name: DatasetName = "iris") -> Dataset:
    if name == "iris":
        bunch = load_iris()
        return Dataset(
            features=np.asarray(bunch.data),
            target=np.asarray(bunch.target),
            feature_names=tuple(bunch.feature_names),
            target_names=tuple(bunch.target_names),
        )
    raise ValueError(f"Unknown dataset: {name!r}")
