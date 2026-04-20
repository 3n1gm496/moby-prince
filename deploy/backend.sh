#!/usr/bin/env bash
# deploy/backend.sh — Build and deploy the backend to Cloud Run.
#
# Usage:
#   ./deploy/backend.sh              # uses defaults from environment
#   PROJECT=my-project ./deploy/backend.sh
#
# Required env vars (or set them below):
#   PROJECT            GCP project ID
#   ENGINE_ID          Vertex AI Search engine ID
#   DATA_STORE_ID      Vertex AI Search datastore ID
#
# Optional:
#   REGION             Cloud Run region                (default: europe-west1)
#   AR_REPO            Artifact Registry repository    (default: moby-prince)
#   SERVICE_NAME       Cloud Run service name          (default: moby-prince-backend)
#   IMAGE_TAG          Docker image tag                (default: git short SHA)
#   FRONTEND_ORIGIN    Allowed CORS origin             (default: https://$SERVICE_NAME-*.run.app)
#
# Prerequisites (one-time setup):
#   gcloud artifacts repositories create moby-prince \
#     --repository-format=docker --location=europe-west1 --project=$PROJECT
#   gcloud auth configure-docker europe-west1-docker.pkg.dev

set -euo pipefail

PROJECT="${PROJECT:-$(gcloud config get-value project)}"
REGION="${REGION:-europe-west1}"
AR_REPO="${AR_REPO:-moby-prince}"
SERVICE_NAME="${SERVICE_NAME:-moby-prince-backend}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
# Artifact Registry replaces gcr.io (deprecated since May 2023)
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${AR_REPO}/${SERVICE_NAME}:${IMAGE_TAG}"

ENGINE_ID="${ENGINE_ID:?ENGINE_ID must be set}"
DATA_STORE_ID="${DATA_STORE_ID:-}"

echo "▶ Building image: ${IMAGE}"
gcloud builds submit \
  --project="${PROJECT}" \
  --tag="${IMAGE}" \
  ./backend

echo "▶ Deploying Cloud Run service: ${SERVICE_NAME} (${REGION})"
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --platform=managed \
  --no-allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=5 \
  --timeout=120 \
  --set-env-vars="NODE_ENV=production" \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT}" \
  --set-env-vars="GCP_LOCATION=${GCP_LOCATION:-eu}" \
  --set-env-vars="ENGINE_ID=${ENGINE_ID}" \
  ${DATA_STORE_ID:+--set-env-vars="DATA_STORE_ID=${DATA_STORE_ID}"} \
  --service-account="moby-prince-backend@${PROJECT}.iam.gserviceaccount.com"

SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT}" --region="${REGION}" --format="value(status.url)")

echo "✔ Deployed: ${SERVICE_URL}"
echo "  Health:   ${SERVICE_URL}/api/health"
