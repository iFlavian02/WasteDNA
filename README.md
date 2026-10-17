# WasteDNA

## Backend development

Use Python 3.11. From the repository root, install `backend/requirements.lock.txt`, then run:

```sh
uvicorn app.main:app --app-dir backend --reload
pytest backend/tests/platform
python scripts/export_openapi.py
```

The API starts at `/api/health`. Copy `.env.example` into your environment as needed;
`APP_MODE=normal` is the default. `APP_MODE=fixtures` only enables fixture routes
that are explicitly registered later. The health route imports pandas,
scikit-learn, and SHAP and reports their installed versions.

Domain owners can add code under `backend/app/analytics`, `decisions`, and
`redistribution`, with their contracts in `backend/app/contracts`. See
`docs/team/README.md` for file ownership and internal function signatures.
