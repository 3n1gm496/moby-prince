#!/usr/bin/env bash
# eventarc.sh — Create an Eventarc trigger that fires the ingest Cloud Run Job
# whenever a new file is uploaded to the raw corpus bucket.
#
# Usage:
#   export GOOGLE_CLOUD_PROJECT=project-fae202f2-19be-4d87-8cd
#   bash ingestion/deploy/eventarc.sh
#
# Run deploy.sh first to create the Cloud Run Job.

set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT}"
REGION="${GCP_REGION:-europe-west1}"
JOB_NAME="moby-ingest-pipeline"
TRIGGER_NAME="moby-ingest-gcs-trigger"
SA_EMAIL="ingest-sa@${PROJECT}.iam.gserviceaccount.com"
RAW_BUCKET="${BUCKET_RAW:-${PROJECT}-corpus-raw}"

echo "Creating Eventarc trigger '${TRIGGER_NAME}'..."
echo "  Bucket:  ${RAW_BUCKET}"
echo "  Job:     ${JOB_NAME}"
echo "  Region:  ${REGION}"
echo ""

# Grant the Eventarc service account permission to invoke the Cloud Run Job
gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.invoker" \
  --condition=None \
  --quiet

# Create the trigger
gcloud eventarc triggers create "${TRIGGER_NAME}" \
  --project="${PROJECT}" \
  --location="${REGION}" \
  --event-filters="type=google.cloud.storage.object.v1.finalized" \
  --event-filters="bucket=${RAW_BUCKET}" \
  --destination-run-job="${JOB_NAME}" \
  --destination-run-region="${REGION}" \
  --service-account="${SA_EMAIL}"

echo ""
echo "Eventarc trigger '${TRIGGER_NAME}' created."
echo "New files in gs://${RAW_BUCKET}/ will automatically trigger ingestion."
