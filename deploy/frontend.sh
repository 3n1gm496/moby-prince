#!/usr/bin/env bash
# deploy/frontend.sh — Build and deploy the frontend SPA.
#
# Two deployment targets are supported; set TARGET to choose:
#
#   TARGET=gcs          Cloud Storage + Cloud CDN (default)
#   TARGET=firebase     Firebase Hosting
#
# Usage:
#   BACKEND_URL=https://moby-prince-backend-xxxx-ew.a.run.app ./deploy/frontend.sh
#
# Required env vars:
#   BACKEND_URL         Full URL of the deployed Cloud Run backend
#
# For GCS target:
#   BUCKET              GCS bucket name (default: ${PROJECT}-frontend)
#   PROJECT             GCP project ID
#
# For Firebase target:
#   FIREBASE_PROJECT    Firebase project ID (default: $PROJECT)

set -euo pipefail

TARGET="${TARGET:-gcs}"
PROJECT="${PROJECT:-$(gcloud config get-value project)}"
BACKEND_URL="${BACKEND_URL:?BACKEND_URL must be set (e.g. https://my-backend-xxxx.run.app)}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${SCRIPT_DIR}/../frontend"

echo "▶ Building frontend (VITE_API_BASE_URL=${BACKEND_URL})"
(
  cd "${FRONTEND_DIR}"
  VITE_API_BASE_URL="${BACKEND_URL}" npm run build
)

if [[ "${TARGET}" == "gcs" ]]; then
  BUCKET="${BUCKET:-${PROJECT}-frontend}"

  echo "▶ Syncing to gs://${BUCKET}/"
  # Long-lived cache for hashed assets
  gsutil -m rsync -r -d \
    -x "index\.html$" \
    "${FRONTEND_DIR}/dist/" \
    "gs://${BUCKET}/"

  # index.html must not be cached (it references hashed asset filenames)
  gsutil -h "Cache-Control:no-cache, no-store" \
    cp "${FRONTEND_DIR}/dist/index.html" "gs://${BUCKET}/index.html"

  # Make objects publicly readable (if bucket is behind Cloud CDN / IAP)
  gsutil iam ch allUsers:objectViewer "gs://${BUCKET}" 2>/dev/null || true

  echo "✔ Frontend deployed to gs://${BUCKET}/"
  echo "  If using Cloud CDN, invalidate the cache:"
  echo "  gcloud compute url-maps invalidate-cdn-cache URL_MAP --path '/*'"

elif [[ "${TARGET}" == "firebase" ]]; then
  FIREBASE_PROJECT="${FIREBASE_PROJECT:-${PROJECT}}"
  echo "▶ Deploying to Firebase Hosting (${FIREBASE_PROJECT})"
  (
    cd "${FRONTEND_DIR}"
    npx firebase-tools deploy --only hosting --project="${FIREBASE_PROJECT}"
  )
  echo "✔ Frontend deployed to Firebase Hosting"

else
  echo "Unknown TARGET: ${TARGET}. Use 'gcs' or 'firebase'." >&2
  exit 1
fi
