"""Smoke tests verifying the package imports and the toolchain runs."""

from __future__ import annotations

import importlib

import pytest

import src

SUBPACKAGES = [
    "src.data",
    "src.features",
    "src.models",
    "src.monitoring",
    "src.pipelines",
    "src.serving",
]


def test_package_version() -> None:
    assert src.__version__


@pytest.mark.parametrize("name", SUBPACKAGES)
def test_subpackage_importable(name: str) -> None:
    module = importlib.import_module(name)
    assert module.__name__ == name
