.PHONY: help install install-dev format lint typecheck test test-unit test-integration cov audit clean ci train serve mlflow-ui

PYTHON ?= python
PIP    ?= $(PYTHON) -m pip

help:
	@echo "Available targets:"
	@echo "  install          Install runtime dependencies"
	@echo "  install-dev      Install runtime + dev dependencies"
	@echo "  format           Auto-format code with ruff"
	@echo "  lint             Run ruff lint checks"
	@echo "  typecheck        Run mypy"
	@echo "  test             Run unit tests (fast loop)"
	@echo "  test-unit        Run only unit tests"
	@echo "  test-integration Run integration tests"
	@echo "  cov              Run tests with coverage report"
	@echo "  audit            Audit dependencies for known vulnerabilities"
	@echo "  ci               Run everything CI runs"
	@echo "  train            Run the iris training pipeline"
	@echo "  serve            Start the model serving API on :8000"
	@echo "  mlflow-ui        Launch the MLflow tracking UI on :5000"
	@echo "  clean            Remove caches and build artifacts"

install:
	$(PIP) install -r requirements.txt

install-dev:
	$(PIP) install -r requirements.txt -r requirements-dev.txt

format:
	ruff format .
	ruff check --fix .

lint:
	ruff check .
	ruff format --check .

typecheck:
	$(PYTHON) -m mypy

test: test-unit

test-unit:
	$(PYTHON) -m pytest tests/unit

test-integration:
	$(PYTHON) -m pytest tests/integration -m integration

cov:
	$(PYTHON) -m pytest --cov=src --cov-report=term-missing --cov-report=xml

audit:
	pip-audit -r requirements.txt

ci: lint typecheck test cov

train:
	$(PYTHON) -m src.pipelines.train_pipeline --output-dir models/iris

serve:
	$(PYTHON) -m uvicorn src.serving.app:app --host $${SERVING_HOST:-0.0.0.0} --port $${SERVING_PORT:-8000} --reload

mlflow-ui:
	$(PYTHON) -m mlflow ui --backend-store-uri $${MLFLOW_TRACKING_URI:-./mlruns} --port 5000

clean:
	rm -rf .pytest_cache .mypy_cache .ruff_cache .coverage coverage.xml htmlcov
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	find . -type d -name "*.egg-info" -prune -exec rm -rf {} +
