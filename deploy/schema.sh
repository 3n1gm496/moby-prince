#!/usr/bin/env bash
# deploy/schema.sh — Apply the Vertex AI Search metadata schema to the datastore.
#
# Run this once after initial datastore creation and again whenever
# backend/filters/schema.js adds or changes filterable/indexable fields.
#
# Usage:
#   ./deploy/schema.sh
#   PROJECT=my-project DATA_STORE_ID=my-store ./deploy/schema.sh
#
# Required env vars:
#   PROJECT       GCP project ID   (default: active gcloud project)
#   DATA_STORE_ID Vertex AI Search datastore ID
#
# Optional:
#   GCP_LOCATION  Discovery Engine location  (default: eu)
#
# What it does:
#   PATCH projects/{project}/locations/{location}/dataStores/{id}/schema/default_schema
#   with the structSchema defined in ingestion/scripts/patch-schema.js.
#   Idempotent — safe to re-run; existing fields are preserved or updated.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
DATA_STORE_ID="${DATA_STORE_ID:?DATA_STORE_ID must be set}"
GCP_LOCATION="${GCP_LOCATION:-eu}"

echo "▶ Patching Vertex AI Search schema"
echo "  Project:    ${PROJECT}"
echo "  Datastore:  ${DATA_STORE_ID}"
echo "  Location:   ${GCP_LOCATION}"
echo ""

GOOGLE_CLOUD_PROJECT="${PROJECT}" \
DATA_STORE_ID="${DATA_STORE_ID}" \
GCP_LOCATION="${GCP_LOCATION}" \
  node "${REPO_ROOT}/ingestion/scripts/patch-schema.js"
