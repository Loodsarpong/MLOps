"""Request and response schemas for the serving API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    features: list[list[float]] = Field(
        ...,
        min_length=1,
        description=(
            "Batch of feature vectors. Each vector must match the model's "
            "expected input shape."
        ),
    )


class PredictResponse(BaseModel):
    predictions: list[int]
    probabilities: list[list[float]] | None = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_path: str
