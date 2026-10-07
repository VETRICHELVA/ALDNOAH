# Expense Sentinel

Expense exception management for finance reviewers. It imports employee expenses, checks them
against policy, compares each one with the employee's and the category's normal spend, runs an
Isolation Forest, and ranks the results by a risk score that breaks down into named signals.
Reviewers investigate and decide; every decision is audited and stored as feedback.

Specs: `docs/` (product, architecture, API contract, anomaly/risk spec, design system).

## Run locally

```bash
docker compose up -d postgres api      # API on :8000 with seeded demo data
pnpm install && pnpm dev               # web on :3000, /api proxied to :8000
```

Without Docker: `uv venv --python 3.12 .venv && uv pip install --python .venv -r requirements.txt uvicorn`,
then `.venv/bin/uvicorn sentinel.main:app --port 8000` (uses SQLite `sentinel.db` when `DATABASE_URL` is unset).

Demo users (password `Sentinel@2026`):

| Email | Role |
|---|---|
| priya.sharma@sentinel.demo | Finance manager |
| reviewer@sentinel.demo | Reviewer |
| viewer@sentinel.demo | Viewer (read-only) |
| admin@sentinel.demo | Admin |

## Deploy to Vercel

1. Push to GitHub and import the repo in Vercel (framework: Next.js, root: repo root).
2. Storage → add **Neon Postgres** from the Marketplace; it sets `DATABASE_URL`.
3. Add env var `JWT_SECRET` (`openssl rand -hex 32`). Optional: `DEMO_PASSWORD`.
4. Deploy. The first API request creates tables, demo users, policies and imports
   `data/demo_expenses.csv` (about 10 s on a cold start).

`api/index.py` serves FastAPI as a Python function; `vercel.json` routes `/api/*` to it.

## Tests

```bash
.venv/bin/pytest -q                     # detection quality gate + API workflow
python data/generate.py                 # regenerate demo data + labels
```

## Detection

Rules → robust statistics (median/MAD, IQR) → Isolation Forest → risk 0–100 (sum of weighted
signals, capped) + confidence (how much history backs the signals). Under 20 = auto-cleared.
See `docs/anomaly-spec.md`. Detection never says "fraud": a finding means *requires review*.
