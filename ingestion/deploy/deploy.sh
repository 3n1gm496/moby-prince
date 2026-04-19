#!/usr/bin/env bash
# deploy.sh — Build and deploy the Moby Prince ingestion pipeline as a Cloud Run Job.
#
# Usage:
#   export GOOGLE_CLOUD_PROJECT=project-fae202f2-19be-4d87-8cd
#   export DATA_STORE_ID=<your-datastore-id>
#   export ENGINE_ID=<your-engine-id>          # optional
#   bash ingestion/deploy/deploy.sh
#
# Prerequisites:
#   - gcloud CLI authenticated (gcloud auth login)
#   - Cloud Run, Cloud Build, Artifact Registry APIs enabled
#   - Service account ingest-sa@$PROJECT.iam.gserviceaccount.com exists
#     (see ingestion/deploy/iam.sh to create it)

set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT}"
REGION="${GCP_REGION:-europe-west1}"
JOB_NAME="moby-ingest-pipeline"
IMAGE_REPO="gcr.io/${PROJECT}/moby-ingest"
SA_EMAIL="ingest-sa@${PROJECT}.iam.gserviceaccount.com"
DATA_STORE_ID="${DATA_STORE_ID:?Set DATA_STORE_ID}"
ENGINE_ID="${ENGINE_ID:-}"
DOCAI_PROCESSOR_ID="${DOCAI_PROCESSOR_ID:-}"

IMAGE_TAG="${IMAGE_REPO}:$(git rev-parse --short HEAD 2>/dev/null || echo latest)"

echo "======================================================"
echo " Moby Prince ingestion pipeline — Cloud Run deployment"
echo "======================================================"
echo " Project:     ${PROJECT}"
echo " Region:      ${REGION}"
echo " Job name:    ${JOB_NAME}"
echo " Image:       ${IMAGE_TAG}"
echo " SA:          ${SA_EMAIL}"
echo "======================================================"
echo ""

# ── 1. Build container image via Cloud Build ──────────────────────────────────
echo "[1/4] Building container image..."
gcloud builds submit \
  --project="${PROJECT}" \
  --region="${REGION}" \
  --tag="${IMAGE_TAG}" \
  --file="ingestion/Dockerfile" \
  .

# ── 2. Create or update the Cloud Run Job ─────────────────────────────────────
echo "[2/4] Deploying Cloud Run Job '${JOB_NAME}'..."

ENV_VARS="GOOGLE_CLOUD_PROJECT=${PROJECT},GCP_LOCATION=eu,STORE_TYPE=firestore,LOG_LEVEL=info,DATA_STORE_ID=${DATA_STORE_ID}"
if [ -n "${ENGINE_ID}" ]; then ENV_VARS="${ENV_VARS},ENGINE_ID=${ENGINE_ID}"; fi
if [ -n "${DOCAI_PROCESSOR_ID}" ]; then ENV_VARS="${ENV_VARS},DOCAI_PROCESSOR_ID=${DOCAI_PROCESSOR_ID}"; fi

deploy_args=(
  --project="${PROJECT}"
  --region="${REGION}"
  --image="${IMAGE_TAG}"
  --tasks=1
  --max-retries=1
  --task-timeout=600s
  --memory=1Gi
  --cpu=1
  --service-account="${SA_EMAIL}"
  --set-env-vars="${ENV_VARS}"
)

if gcloud run jobs describe "${JOB_NAME}" --project="${PROJECT}" --region="${REGION}" &>/dev/null; then
  echo "  Updating existing job..."
  gcloud run jobs update "${JOB_NAME}" "${deploy_args[@]}"
else
  echo "  Creating new job..."
  gcloud run jobs create "${JOB_NAME}" "${deploy_args[@]}"
fi

# ── 3. Cloud Scheduler — retry every 15 minutes ───────────────────────────────
echo "[3/4] Setting up Cloud Scheduler trigger (every 15 min)..."

SCHEDULER_NAME="moby-ingest-retry"
JOB_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${JOB_NAME}:run"

if gcloud scheduler jobs describe "${SCHEDULER_NAME}" --project="${PROJECT}" --location="${REGION}" &>/dev/null; then
  echo "  Scheduler '${SCHEDULER_NAME}' already exists — skipping."
else
  gcloud scheduler jobs create http "${SCHEDULER_NAME}" \
    --project="${PROJECT}" \
    --location="${REGION}" \
    --schedule="*/15 * * * *" \
    --uri="${JOB_URI}" \
    --http-method=POST \
    --oauth-service-account-email="${SA_EMAIL}" \
    --message-body="{}"
  echo "  Scheduler created."
fi

# ── 4. Daily scan trigger ─────────────────────────────────────────────────────
echo "[4/4] Setting up daily scan scheduler (02:00 UTC)..."

SCAN_SCHEDULER="moby-ingest-scan"

if gcloud scheduler jobs describe "${SCAN_SCHEDULER}" --project="${PROJECT}" --location="${REGION}" &>/dev/null; then
  echo "  Scheduler '${SCAN_SCHEDULER}' already exists — skipping."
else
  gcloud scheduler jobs create http "${SCAN_SCHEDULER}" \
    --project="${PROJECT}" \
    --location="${REGION}" \
    --schedule="0 2 * * *" \
    --uri="${JOB_URI}" \
    --http-method=POST \
    --oauth-service-account-email="${SA_EMAIL}" \
    --message-body="{\"overrides\":{\"containerOverrides\":[{\"args\":[\"scan\"]}]}}"
  echo "  Scan scheduler created."
fi

echo ""
echo "Deployment complete."
echo ""
echo "Run manually:  gcloud run jobs execute ${JOB_NAME} --project=${PROJECT} --region=${REGION}"
echo "View logs:     gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}' --project=${PROJECT} --limit=50"
