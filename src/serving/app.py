"""FastAPI inference service.

Loads a joblib-persisted sklearn pipeline at startup and exposes:

- ``GET  /healthz``  liveness + model-loaded probe
- ``POST /predict``  batch prediction with optional class probabilities

Run locally::

    python -m uvicorn src.serving.app:app --reload
"""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from sklearn.pipeline import Pipeline

from src.serving.schemas import HealthResponse, PredictRequest, PredictResponse

logger = logging.getLogger(__name__)

DEFAULT_MODEL_PATH = Path("models/iris/model.joblib")
MODEL_PATH_ENV = "SERVING_MODEL_PATH"


def _resolve_model_path() -> Path:
    return Path(os.environ.get(MODEL_PATH_ENV, str(DEFAULT_MODEL_PATH)))


def load_model(path: Path) -> Pipeline:
    if not path.exists():
        raise FileNotFoundError(f"Model artifact not found at {path}")
    model = joblib.load(path)
    logger.info("Loaded model from %s", path)
    return model


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    model_path = _resolve_model_path()
    app.state.model_path = model_path
    try:
        app.state.model = load_model(model_path)
    except FileNotFoundError as exc:
        # Allow the service to start so /healthz can report the issue;
        # /predict will return 503 until a model is provided.
        logger.warning("Starting without a model: %s", exc)
        app.state.model = None
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="MLOps Serving API",
        version="0.0.1",
        lifespan=lifespan,
    )

    @app.get("/healthz", response_model=HealthResponse)
    def healthz() -> HealthResponse:
        return HealthResponse(
            status="ok",
            model_loaded=app.state.model is not None,
            model_path=str(app.state.model_path),
        )

    @app.post("/predict", response_model=PredictResponse)
    def predict(request: PredictRequest) -> PredictResponse:
        model: Pipeline | None = app.state.model
        if model is None:
            raise HTTPException(status_code=503, detail="Model not loaded.")

        features = np.asarray(request.features, dtype=np.float64)
        try:
            preds = model.predict(features)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        probabilities: list[list[float]] | None = None
        if hasattr(model, "predict_proba"):
            probabilities = model.predict_proba(features).tolist()

        return PredictResponse(
            predictions=[int(p) for p in preds],
            probabilities=probabilities,
        )

    return app


app = create_app()
