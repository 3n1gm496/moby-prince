# Deployment Guide

## Local development

### Prerequisites

1. Node.js 20+, Docker, `gcloud` CLI installed and authenticated
2. An active GCP project with Vertex AI Search configured
3. Application Default Credentials (ADC):
   ```bash
   gcloud auth application-default login
   ```

### Option A — Node.js directly (fastest iteration)

```bash
# Backend
cd backend
cp .env.example .env        # fill in GOOGLE_CLOUD_PROJECT, ENGINE_ID, etc.
npm install
node server.js

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # → http://localhost:5173
```

### Option B — docker-compose

```bash
cp backend/.env.example backend/.env   # fill in your values

docker compose up --build
# Backend:  http://localhost:3001
# Frontend: http://localhost:5173
```

The compose file mounts `~/.config/gcloud` into the container so ADC works without a service account key.

---

## Production on Google Cloud

### Architecture

```
Internet
  └─ IAP (Identity-Aware Proxy)
       └─ Cloud Run: moby-prince-backend
            ├─ Vertex AI Search  (EU data residency)
            └─ Firestore          (ingestion state)

Cloud Storage bucket (frontend SPA)
  └─ Cloud CDN  (optional)
```

### 1. Service account

The backend runs as a dedicated service account. Create it once:

```bash
PROJECT=$(gcloud config get-value project)
SA="moby-prince-backend@${PROJECT}.iam.gserviceaccount.com"

gcloud iam service-accounts create moby-prince-backend \
  --display-name="Moby Prince backend"

# Vertex AI Search
gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member="serviceAccount:${SA}" \
  --role="roles/discoveryengine.viewer"

# Firestore (if STORE_TYPE=firestore in ingestion)
gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member="serviceAccount:${SA}" \
  --role="roles/datastore.user"
```

### 2. Deploy the backend

```bash
# From repo root:
ENGINE_ID=your-engine-id \
DATA_STORE_ID=your-datastore-id \
  ./deploy/backend.sh
```

The script builds via Cloud Build, deploys to Cloud Run with `--no-allow-unauthenticated`, and prints the service URL.

### 3. Identity-Aware Proxy (IAP)

The Cloud Run service is deployed without public access. IAP is the recommended access control mechanism for a solo analyst tool.

```bash
# Enable IAP for Cloud Run
gcloud services enable iap.googleapis.com

# Grant yourself access
gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member="user:you@example.com" \
  --role="roles/iap.httpsResourceAccessor"
```

When IAP is active, every request carries an `X-Goog-Authenticated-User-Email` header the backend can read if needed. The backend does not implement its own authentication — it relies entirely on IAP.

### 4. Deploy the frontend

**Option A — Cloud Storage + CDN** (simpler):
```bash
BACKEND_URL=https://moby-prince-backend-xxxx-ew.a.run.app \
BUCKET=your-project-id-frontend \
  ./deploy/frontend.sh
```

Create and configure the bucket once:
```bash
gsutil mb -l EU "gs://${BUCKET}"
gsutil web set -m index.html -e index.html "gs://${BUCKET}"
```

**Option B — Firebase Hosting** (managed CDN, easier custom domain):
```bash
TARGET=firebase \
BACKEND_URL=https://moby-prince-backend-xxxx-ew.a.run.app \
  ./deploy/frontend.sh
```

### 5. CORS configuration

The backend only allows requests from `FRONTEND_ORIGIN`. Set it in the Cloud Run deployment:

```bash
gcloud run services update moby-prince-backend \
  --update-env-vars FRONTEND_ORIGIN=https://your-frontend-domain.com
```

---

## Environment variables

See `backend/.env.example` and `docs/runtime-config.md` for the full reference.

---

## Monitoring

Cloud Run writes structured NDJSON logs to Cloud Logging automatically. The backend emits `severity`, `message`, `requestId`, `traceId`, `component`, and `durationMs` fields on every request.

To view logs:
```bash
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=moby-prince-backend' \
  --limit=50 --format=json | jq '.[].jsonPayload'
```

### Key log queries

```
# All errors in the last hour
severity >= ERROR AND resource.labels.service_name="moby-prince-backend"

# Slow requests (> 5 s)
jsonPayload.durationMs > 5000

# Specific request trace
jsonPayload.requestId="<id from X-Request-ID header>"
```

---

## Rolling back

```bash
# List recent revisions
gcloud run revisions list --service=moby-prince-backend --region=europe-west1

# Route 100% traffic to a previous revision
gcloud run services update-traffic moby-prince-backend \
  --to-revisions=moby-prince-backend-00042-abc=100 \
  --region=europe-west1
```
