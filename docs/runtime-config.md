# Runtime Configuration Reference

All configuration is read from environment variables at startup. The server throws immediately if a required variable is missing, so misconfiguration is visible before the first request is served.

## Backend environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | **yes** | — | GCP project ID |
| `ENGINE_ID` | **yes** | — | Vertex AI Search engine ID |
| `GCP_LOCATION` | no | `eu` | Discovery Engine region (`eu`, `global`, `us`) |
| `DATA_STORE_ID` | no | — | Datastore ID for chunk-level evidence lookup. If unset, `/api/evidence/documents/:id/chunks` returns 501. |
| `GCS_BUCKET` | no | — | GCS bucket name for the corpus. Enables `/api/storage/*` endpoints. |
| `API_KEY` | no | — | Shared secret for `/api/*` endpoints. Pass via `X-API-Key` header. Required in production unless `TRUST_IAP_HEADERS=true` behind IAP or a trusted proxy. |
| `TRUST_IAP_HEADERS` | no | `false` | When `true`, protected routes also accept trusted `X-Goog-Authenticated-User-*` headers from IAP instead of `X-API-Key`. Never enable outside trusted ingress. |
| `PORT` | no | `3001` | TCP port the HTTP server listens on. Cloud Run sets this automatically. |
| `NODE_ENV` | no | `development` | `production` enables NDJSON structured logging and disables coloured TTY output. |
| `LOG_LEVEL` | no | `debug` (dev) / `info` (prod) | Minimum log severity: `debug`, `info`, `warn`, `error` |
| `FRONTEND_ORIGIN` | no | `http://localhost:5173` | Allowed CORS origin. Set to your frontend URL in production. |
| `CHUNK_CONTEXT_PREV` | no | `1` | Adjacent chunks before each match in `:answer` responses. |
| `CHUNK_CONTEXT_NEXT` | no | `1` | Adjacent chunks after each match in `:answer` responses. |
| `BQ_PROJECT_ID` | no | `GOOGLE_CLOUD_PROJECT` | BigQuery project for the evidence dataset. |
| `BQ_DATASET_ID` | no | `evidence` | BigQuery dataset name for the evidence layer. |
| `BQ_LOCATION` | no | `EU` | BigQuery dataset location. |
| `FIRESTORE_DB` | no | `(default)` | Firestore database ID for session persistence. |
| `GEMINI_LOCATION` | no | `us-central1` | Vertex AI region for Gemini 2.0 Flash calls. `us-central1` has the broadest model availability. |
| `DOCAI_LOCATION` | no | `GCP_LOCATION` | Document AI region (defaults to `GCP_LOCATION`). |
| `DAILY_GEMINI_LIMIT` | no | `500` | Max Gemini API calls per day before returning 429. Resets at midnight UTC. |
| `DAILY_BQ_LIMIT` | no | `2000` | Max BigQuery calls per day before returning 429. Resets at midnight UTC. |

### Discovery Engine endpoints

The backend derives API URLs from `GOOGLE_CLOUD_PROJECT`, `GCP_LOCATION`, and `ENGINE_ID`. You never set these URLs directly.

- **Answer** (RAG): `https://{location}-discoveryengine.googleapis.com/v1/…:answer`
- **Search** (chunks): `https://{location}-discoveryengine.googleapis.com/v1/…:search`

---

## Authentication

The backend uses **Application Default Credentials (ADC)** — it never reads a hard-coded key.

| Environment | How ADC is resolved |
|---|---|
| Local (direct) | `gcloud auth application-default login` → `~/.config/gcloud/application_default_credentials.json` |
| Local (docker-compose) | Same file, mounted as volume at `/home/node/.config/gcloud/` |
| Cloud Run | Workload Identity attached to the `moby-prince-backend` service account |

The service account needs these roles:

| Role | Purpose |
|---|---|
| `roles/discoveryengine.viewer` | Query Vertex AI Search (answer + search endpoints) |
| `roles/datastore.user` | Read/write Firestore (ingestion job state, if enabled) |

Client authentication for `/api/*` is separate from ADC:

- default: `X-API-Key`
- optional: trusted IAP headers when `TRUST_IAP_HEADERS=true`

---

## IAP-protected deployments

When the backend runs behind Identity-Aware Proxy, every authenticated request includes:

```
X-Goog-Authenticated-User-Email: accounts.google.com:user@example.com
X-Goog-Authenticated-User-ID: accounts.google.com:123456789
```

When `TRUST_IAP_HEADERS=true`, protected routes accept these headers as an alternative to `X-API-Key`.
If `TRUST_IAP_HEADERS=false`, they are ignored for authentication.

**Important:** never trust these headers when IAP is NOT configured. In that case, any caller could spoof them.

---

## Secrets management

No secrets are stored in the codebase or Docker images. For Cloud Run:

- Use **Secret Manager** for sensitive values (e.g. if you later add a database password).
- Mount secrets as environment variables:
  ```bash
  gcloud run services update moby-prince-backend \
    --update-secrets=DB_PASSWORD=my-secret:latest
  ```

For the current configuration (Discovery Engine via ADC), no secrets are needed.

---

## Local `.env` file

Copy `backend/.env.example` to `backend/.env` and fill in your values. The `.env` file is git-ignored and must never be committed.

```bash
cp backend/.env.example backend/.env
```

The server loads `.env` via `dotenv` at startup (only when running with `node server.js` directly). Docker and Cloud Run do not use `.env` — environment variables must be set via compose or `gcloud run deploy --set-env-vars`.

---

## Startup validation

On startup the server logs the active configuration:

```
INFO  [app] Server configuration loaded  {
  nodeEnv: 'production',
  port: 3001,
  logLevel: 'info',
  projectId: 'your-project',
  location: 'eu',
  engineId: 'moby-prince_xxx',
  dataStoreId: 'moby-prince_yyy',
  frontendOrigin: 'https://your-frontend.example.com',
  bqDataset: 'your-project.evidence'
}
```

If `DATA_STORE_ID` is not set a `WARN` is also emitted:
```
WARN  [app] DATA_STORE_ID is not set — chunk/document lookup endpoints will be disabled
```
