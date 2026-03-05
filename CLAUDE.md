# CLAUDE.md — MLOps Repository Guide

This file provides context for AI assistants (Claude and others) working in this repository.
Update this file as the project evolves.

---

## Project Overview

**Repository:** Loodsarpong/MLOps
**Purpose:** MLOps (Machine Learning Operations) project — pipelines, model training, serving, monitoring, and infrastructure automation.

> Update this section with a concrete description once the project scope is defined.

---

## Repository Structure

```
MLOps/
├── CLAUDE.md               # This file
├── README.md               # Human-facing documentation (add when ready)
├── .github/
│   └── workflows/          # CI/CD pipeline definitions
├── data/
│   ├── raw/                # Immutable raw data (never modify)
│   ├── processed/          # Cleaned/transformed data
│   └── external/           # Third-party data sources
├── models/                 # Trained model artifacts and configs
├── notebooks/              # Exploratory Jupyter notebooks (not production code)
├── src/
│   ├── data/               # Data ingestion and preprocessing
│   ├── features/           # Feature engineering
│   ├── models/             # Model training, evaluation, prediction
│   ├── pipelines/          # End-to-end ML pipeline orchestration
│   ├── serving/            # Model serving / inference API
│   └── monitoring/         # Data drift, model performance monitoring
├── tests/
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── fixtures/           # Shared test data and mocks
├── configs/                # Experiment and pipeline configuration files (YAML)
├── scripts/                # One-off utility scripts (not production)
├── docker/                 # Dockerfiles and compose files
├── infra/                  # Infrastructure-as-code (Terraform, Helm, etc.)
├── requirements.txt        # Python runtime dependencies
├── requirements-dev.txt    # Development-only dependencies
├── pyproject.toml          # Python project metadata and tool config
├── Makefile                # Convenience commands
└── .env.example            # Environment variable template (never commit .env)
```

> Update this tree to reflect the actual directory layout as files are added.

---

## Development Environment

### Prerequisites

- Python 3.10+ (check `.python-version` or `pyproject.toml` for the pinned version)
- `pip` / `uv` / `poetry` (whichever package manager is configured)
- Docker & Docker Compose (for containerized services)
- `make` (for Makefile commands)

### Setup

```bash
# Clone the repo
git clone <remote-url>
cd MLOps

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Copy environment config and fill in values
cp .env.example .env
```

> Replace these steps with the actual setup commands once they are established.

---

## Common Commands (Makefile)

| Command             | Description                              |
|---------------------|------------------------------------------|
| `make install`      | Install all dependencies                 |
| `make test`         | Run the full test suite                  |
| `make lint`         | Run linters (ruff, mypy, etc.)           |
| `make format`       | Auto-format code                         |
| `make train`        | Run a training pipeline                  |
| `make serve`        | Start the model serving API locally      |
| `make docker-build` | Build Docker images                      |
| `make ci`           | Run everything CI would run              |

> Populate the Makefile and update this table as commands are defined.

---

## Code Conventions

### Python Style

- **Formatter:** `ruff format` (or `black` if configured differently — check `pyproject.toml`)
- **Linter:** `ruff` with strict settings
- **Type checking:** `mypy` with strict mode enabled
- **Docstrings:** Google-style docstrings for all public functions and classes
- **Line length:** 88 characters (black/ruff default)

```toml
# Example pyproject.toml snippet
[tool.ruff]
line-length = 88
select = ["E", "F", "I", "N", "UP", "ANN"]

[tool.mypy]
strict = true
```

### Imports

Order imports: standard library → third-party → local. Use `ruff` to enforce this automatically.

### Naming

| Construct          | Convention          | Example                   |
|--------------------|---------------------|---------------------------|
| Files/modules      | `snake_case`        | `train_model.py`          |
| Classes            | `PascalCase`        | `FeaturePipeline`         |
| Functions/vars     | `snake_case`        | `load_dataset()`          |
| Constants          | `UPPER_SNAKE_CASE`  | `MAX_EPOCHS = 100`        |
| Config keys (YAML) | `snake_case`        | `learning_rate: 0.001`    |

### Notebooks

- Notebooks live in `notebooks/` and are for **exploration only** — not production code.
- Clear all cell outputs before committing (`jupyter nbconvert --clear-output`).
- Production-ready logic must be refactored into `src/`.

---

## Testing

### Running Tests

```bash
# All tests
pytest

# Unit tests only
pytest tests/unit/

# With coverage
pytest --cov=src --cov-report=term-missing

# Single test file
pytest tests/unit/test_features.py -v
```

### Testing Conventions

- Every module in `src/` should have a corresponding test file in `tests/unit/`.
- Use `pytest` fixtures for shared setup; avoid test interdependency.
- Mock external services (databases, cloud APIs) in unit tests.
- Integration tests may use real infrastructure but must be idempotent and isolated.
- Minimum acceptable coverage: **80%** (enforced in CI).

---

## ML Pipeline Conventions

### Experiment Tracking

- Use **MLflow** (or the configured tracker — update if different) for logging metrics, params, and artifacts.
- Every training run must log: hyperparameters, evaluation metrics, and the model artifact.
- Tag runs with `git_commit`, `dataset_version`, and `run_name`.

### Configuration

- All pipeline hyperparameters and settings live in `configs/*.yaml`.
- Use **Hydra** or **OmegaConf** for config composition (update if a different library is used).
- Never hard-code magic numbers in source code — reference config values.

### Data Versioning

- Use **DVC** (or the configured tool) to version datasets and model artifacts.
- Raw data in `data/raw/` is immutable — never overwrite it.
- All data transformations must be reproducible given the same input and config.

### Model Registry

- Promote models through stages: `Staging → Production → Archived`.
- A model must pass evaluation thresholds before promotion to `Production`.
- Document the champion model's metrics and training config in `models/README.md`.

---

## Git Workflow

### Branching

- `main` — stable, production-ready code. Direct pushes are blocked.
- `develop` — integration branch for features.
- `feature/<short-description>` — individual feature branches.
- `fix/<short-description>` — bug fix branches.
- `claude/<session-id>` — branches used by AI assistants (this convention is enforced).

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`

Examples:
```
feat(pipeline): add feature engineering step for user embeddings
fix(serving): correct tensor dtype mismatch in inference handler
test(models): add unit tests for GradientBoosting wrapper
docs(readme): update setup instructions for Python 3.11
```

### Pull Requests

- Every PR must have a description explaining **what** changed and **why**.
- Link the PR to a GitHub Issue when applicable.
- All CI checks must pass before merging.
- Require at least one reviewer approval.
- Squash merge into `develop`; merge commits into `main`.

---

## CI/CD

CI runs on every push and PR. The pipeline typically includes:

1. **Lint** — `ruff` + `mypy`
2. **Unit tests** — `pytest tests/unit/`
3. **Integration tests** — `pytest tests/integration/` (may require secrets)
4. **Build** — Docker image build
5. **Deploy** — Automated deployment to staging on merge to `develop`; production on merge to `main`

Secrets (API keys, credentials) are stored in GitHub Actions secrets — never in code or config files.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values. Never commit `.env`.

| Variable                | Description                                   |
|-------------------------|-----------------------------------------------|
| `MLFLOW_TRACKING_URI`   | URI for the MLflow tracking server            |
| `MODEL_REGISTRY_URI`    | URI for the model registry                    |
| `DATA_BUCKET`           | Cloud storage bucket for datasets/artifacts   |
| `DATABASE_URL`          | Connection string for the metadata database   |
| `API_KEY`               | API key for the model serving endpoint        |

> Add/remove rows as environment variables are defined.

---

## Dependency Management

- Runtime dependencies: `requirements.txt` (pinned versions for reproducibility)
- Dev dependencies: `requirements-dev.txt` (linters, test tools, notebooks)
- When adding a new dependency:
  1. Add it with a pinned version.
  2. Run `pip-compile` (or equivalent) to regenerate lock files if used.
  3. Document why the dependency is needed in the PR description.

---

## Security

- Never commit secrets, credentials, API keys, or passwords.
- Scan dependencies for vulnerabilities: `pip-audit` or `safety check`.
- All external inputs (API requests, file uploads) must be validated before processing.
- Follow least-privilege principles for cloud IAM roles.

---

## Key Contacts & Resources

| Resource                  | Location / Link                              |
|---------------------------|----------------------------------------------|
| Issue tracker             | GitHub Issues (this repo)                    |
| CI/CD pipelines           | GitHub Actions (`.github/workflows/`)        |
| MLflow UI                 | (add URL when deployed)                      |
| Model registry            | (add URL when deployed)                      |
| Internal documentation    | (add link to wiki/confluence/notion)         |

---

## Notes for AI Assistants

- **Always read files before editing them.** Do not assume file contents.
- **Follow the branching convention.** AI-generated branches must use `claude/<session-id>` format.
- **Do not hard-code credentials or secrets.**
- **Keep changes minimal and focused.** Avoid refactoring unrelated code in the same PR.
- **Run tests** (`pytest`) and **linting** (`ruff check . && mypy src/`) after making changes.
- **Update this CLAUDE.md** whenever the project structure, tooling, or conventions change significantly.
- When uncertain about project intent, read existing code, then ask rather than assume.

---

*Last updated: 2026-03-05 — Repository is in initial setup phase; update this file as the project is built out.*
