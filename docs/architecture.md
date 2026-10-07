# Architecture

## Shape

```
Browser
  │  same origin
  ▼
Next.js 15 (App Router, TypeScript, Tailwind)        ── Vercel
  │  fetch /api/*  (cookie auth)
  ▼
FastAPI (Python function: api/index.py)              ── Vercel Python runtime
  ├─ routers: auth, expenses, anomalies, dashboard, analytics,
  │           policies, imports, reports, evaluation, users
  ├─ ingest.py      parse → validate → normalize
  └─ detect/        features → rules → stats → ml → risk → explain
  │
  ▼
PostgreSQL                                            ── Neon (Vercel Marketplace)
```

Local dev: `docker compose up` runs postgres + api (uvicorn) + web (next dev); Next rewrites
`/api/*` to the api container so the browser sees one origin, exactly like Vercel.

## Repository

```
/                       Next.js project root (Vercel root)
  app/(auth)/login
  app/(app)/overview | anomalies | anomalies/[id] | expenses | expenses/[id]
           analytics | policies | data | reports | settings
  components/           Table, Filters, RiskMark, Tally, AmountRuler, EvidencePanel, ...
  lib/api.ts            typed client; lib/types.ts mirrors Pydantic schemas
  api/index.py          `from sentinel.main import app`
  sentinel/             Python package
    main.py  config.py  db.py  models.py  schemas.py  auth.py  audit.py
    ingest.py  analysis.py  eval.py  seed.py
    routers/*.py
    detect/features.py rules.py stats.py ml.py risk.py explain.py
  tests/                pytest
  e2e/                  Playwright demo-path test
  data/generate.py      seed generator → data/demo_expenses.csv, data/labels.csv
  docs/
  requirements.txt  package.json  vercel.json  docker-compose.yml  Dockerfile.api
```

## Pipeline (`analysis.run()`)

Batch, deterministic, whole-dataset. Triggered after every import and by `POST /api/analysis/run`.

1. Load all transactions + active policies.
2. `features.build()` → numpy arrays: per-employee and per-category robust baselines
   (median, MAD, IQR), merchant counts, rolling 7-day counts, days since previous, ratio to limit.
3. `rules`, `stats`, `ml` each return `Signal` objects per transaction.
4. `risk.aggregate()` → score, severity, confidence.
5. `explain.render()` → interpretation sentence, evidence dict, recommended action.
6. Upsert `anomaly_findings` (one per transaction, score ≥ 20):
   - unresolved findings: overwritten with fresh scores/evidence;
   - resolved findings (approved / rejected / legitimate): never modified;
   - unresolved findings that drop below 20 with no review actions: deleted.

Determinism: Isolation Forest uses `random_state=42`. Same data → same findings.

## Key decisions

| Decision | Why |
|---|---|
| Single Vercel project, FastAPI as Python function | One repo, one deploy, no CORS. |
| No pandas | Keeps the Python function bundle small; numpy is enough for these aggregates. |
| Batch analysis, stored findings | Fast reads, consistent dashboard and queue, explainable reruns. |
| Findings keyed 1:1 by transaction | A reviewer decides on an expense, not on each signal. |
| Receipts as columns on `transactions` | MVP has receipt metadata only; no blob storage. |
| Templates, no LLM | Every sentence traceable to numbers; no API keys or network risk at demo time. |
| JWT in httpOnly cookie | Stateless (fits serverless), not readable by JS. |

## Limits and upgrade paths

- Upload body ≤ 4 MB (Vercel 4.5 MB cap) → ~20k rows. Larger: Vercel Blob + background job.
- Whole-dataset reanalysis is O(n log n), ~1 s at 5k rows. Beyond ~100k rows: incremental
  baselines + queue worker.
- Receipt images: Vercel Blob + receipts table (V2).

## Security

See `api-contract.md` §Auth. bcrypt hashes; JWT (HS256, 8 h) in `Secure; HttpOnly; SameSite=Lax`
cookie; role dependency on every mutating route; SQLAlchemy parameterized queries; React escaping;
upload extension + size + parse validation (openpyxl `read_only=True`, no macros evaluated);
CSV export prefixes cells starting with `= + - @` with `'`; secrets from env
(`DATABASE_URL`, `JWT_SECRET`); every review/policy/import action written to `audit_logs`.

## Environment

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | api | Neon connection string (Vercel Marketplace sets it) |
| `JWT_SECRET` | api | ≥ 32 random bytes |
| `SEED_DEMO` | api | `1` → first boot creates schema, demo users, policies, demo data |
