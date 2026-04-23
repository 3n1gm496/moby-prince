#!/usr/bin/env bash
# iam.sh — Create the ingest service account and grant it the roles required
# by the ingestion pipeline.
#
# Usage:
#   export GOOGLE_CLOUD_PROJECT=project-fae202f2-19be-4d87-8cd
#   bash ingestion/deploy/iam.sh
#
# Run this once before deploy.sh and eventarc.sh.

set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT}"
SA_NAME="ingest-sa"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
RAW_BUCKET="${BUCKET_RAW:-${GCS_BUCKET:-${PROJECT}-corpus-raw}}"
NORM_BUCKET="${BUCKET_NORMALIZED:-${RAW_BUCKET}-normalized}"
QUAR_BUCKET="${BUCKET_QUARANTINE:-${RAW_BUCKET}-quarantine}"

echo "Setting up IAM for ingestion pipeline..."
echo "  Project: ${PROJECT}"
echo "  SA:      ${SA_EMAIL}"
echo ""

# ── Create service account ────────────────────────────────────────────────────
if gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT}" &>/dev/null; then
  echo "Service account ${SA_EMAIL} already exists."
else
  gcloud iam service-accounts create "${SA_NAME}" \
    --project="${PROJECT}" \
    --display-name="Moby Prince ingestion pipeline"
  echo "Service account created."
fi

bind() {
  gcloud projects add-iam-policy-binding "${PROJECT}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$1" \
    --condition=None \
    --quiet
}

# ── Project-level roles ───────────────────────────────────────────────────────
echo "Granting project-level roles..."
bind "roles/datastore.user"                    # Firestore read/write
bind "roles/logging.logWriter"                 # Cloud Logging
bind "roles/monitoring.metricWriter"           # Cloud Monitoring custom metrics
bind "roles/cloudtrace.agent"                  # Cloud Trace (optional)
bind "roles/discoveryengine.editor"            # Vertex AI Search import

# ── GCS bucket roles ──────────────────────────────────────────────────────────
echo "Granting GCS roles..."

gcloud storage buckets add-iam-policy-binding "gs://${RAW_BUCKET}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectViewer"

gcloud storage buckets add-iam-policy-binding "gs://${NORM_BUCKET}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin"

gcloud storage buckets add-iam-policy-binding "gs://${QUAR_BUCKET}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin"

# ── Document AI (optional) ────────────────────────────────────────────────────
bind "roles/documentai.editor"

echo ""
echo "IAM setup complete. Run deploy.sh next."
