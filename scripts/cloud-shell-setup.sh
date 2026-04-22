#!/usr/bin/env bash
# scripts/cloud-shell-setup.sh
#
# Eseguire in Google Cloud Shell per creare tutte le risorse GCP necessarie
# al deployment locale di Moby Prince (rete LAN, nessun Cloud Run).
#
# Cosa fa:
#   1. Abilita le API GCP richieste
#   2. Crea il bucket GCS per il corpus
#   3. Crea il database Firestore (modalità nativa)
#   4. Crea il datastore e l'engine Vertex AI Search
#   5. Applica lo schema metadati al datastore
#   6. Stampa il contenuto del file backend/.env da copiare in locale
#
# Utilizzo rapido (tutto con un comando):
#   bash <(curl -sL https://raw.githubusercontent.com/.../scripts/cloud-shell-setup.sh)
#
# Oppure clona il repo e lancia da Cloud Shell:
#   ./scripts/cloud-shell-setup.sh
#
# Override variabili:
#   PROJECT=mio-progetto GCP_LOCATION=eu ./scripts/cloud-shell-setup.sh

set -euo pipefail

# ── Colori ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔${NC}  $*"; }
info() { echo -e "${BLUE}▶${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
die()  { echo -e "${RED}✖  ERRORE: $*${NC}" >&2; exit 1; }
step() { echo ""; echo -e "${BOLD}── $* ${NC}"; echo ""; }

# ── Configurazione ────────────────────────────────────────────────────────────

PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
[[ -z "$PROJECT" ]] && die "Nessun progetto GCP attivo.\nEseguire: gcloud config set project TUO-PROGETTO-ID"

# Vertex AI Search — EU data residency
GCP_LOCATION="${GCP_LOCATION:-eu}"

# GCS e Firestore — multi-region EU
GCS_LOCATION="${GCS_LOCATION:-EU}"
FS_LOCATION="${FS_LOCATION:-eur3}"

# Nomi risorse (personalizzabili tramite env)
CORPUS_BUCKET="${CORPUS_BUCKET:-${PROJECT}-corpus-raw}"
DATASTORE_ID="${DATASTORE_ID:-moby-prince-ds}"
ENGINE_ID="${ENGINE_ID:-moby-prince-engine}"

# Endpoint Discovery Engine
DE_API="https://${GCP_LOCATION}-discoveryengine.googleapis.com/v1"
COL="${DE_API}/projects/${PROJECT}/locations/${GCP_LOCATION}/collections/default_collection"

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Moby Prince — Setup GCP per deployment locale  ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Progetto GCP : ${PROJECT}"
echo "  Regione DE   : ${GCP_LOCATION}  (Vertex AI Search)"
echo "  Regione GCS  : ${GCS_LOCATION}  (bucket corpus)"
echo "  Regione FS   : ${FS_LOCATION}   (Firestore)"
echo "  Bucket       : gs://${CORPUS_BUCKET}"
echo "  Datastore ID : ${DATASTORE_ID}"
echo "  Engine ID    : ${ENGINE_ID}"
echo ""
read -r -p "  Continuare? [s/N] " CONFIRM
[[ "$CONFIRM" =~ ^[Ss]$ ]] || { echo "Annullato."; exit 0; }

# ── 1. Abilitazione API ───────────────────────────────────────────────────────
step "1 / 6  Abilitazione API GCP"
gcloud services enable \
  discoveryengine.googleapis.com \
  storage.googleapis.com \
  firestore.googleapis.com \
  iam.googleapis.com \
  --project="${PROJECT}" --quiet
ok "API abilitate"

# ── 2. Bucket GCS corpus ──────────────────────────────────────────────────────
step "2 / 6  Bucket GCS"
if gcloud storage buckets describe "gs://${CORPUS_BUCKET}" \
     --project="${PROJECT}" &>/dev/null; then
  warn "Bucket gs://${CORPUS_BUCKET} già esistente — saltato"
else
  gcloud storage buckets create "gs://${CORPUS_BUCKET}" \
    --location="${GCS_LOCATION}" \
    --uniform-bucket-level-access \
    --project="${PROJECT}" --quiet
  ok "Bucket gs://${CORPUS_BUCKET} creato"
fi

# ── 3. Firestore (modalità nativa) ────────────────────────────────────────────
step "3 / 6  Firestore"
if gcloud firestore databases list --project="${PROJECT}" 2>/dev/null \
     | grep -q "(default)"; then
  warn "Firestore (default) già esistente — saltato"
else
  gcloud firestore databases create \
    --location="${FS_LOCATION}" \
    --type=firestore-native \
    --project="${PROJECT}" --quiet
  ok "Firestore creato (${FS_LOCATION})"
fi

# ── 4a. Datastore Vertex AI Search ───────────────────────────────────────────
step "4 / 6  Vertex AI Search — Datastore"

# Refresh token (potrebbe essere scaduto)
TOKEN=$(gcloud auth print-access-token)

_de_get() {
  curl -sf "$1" -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || true
}
_de_post() {
  curl -sf -X POST "$1" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$2" 2>/dev/null || true
}
_wait_op() {
  local OP="$1" LABEL="$2"
  if [[ -z "$OP" ]]; then
    warn "Nessuna operazione da attendere per ${LABEL}"
    return
  fi
  info "Attesa completamento: ${LABEL}..."
  for i in $(seq 1 40); do
    local RESP DONE
    RESP=$(_de_get "${DE_API}/${OP}")
    DONE=$(echo "$RESP" | python3 -c \
      "import sys,json; print(json.load(sys.stdin).get('done', False))" 2>/dev/null || echo False)
    [[ "$DONE" == "True" ]] && { ok "${LABEL} completato"; return; }
    printf '.'
    sleep 6
  done
  echo ""
  warn "${LABEL}: timeout (potrebbe ancora essere in creazione)"
}

DS_EXISTS=$(_de_get "${COL}/dataStores/${DATASTORE_ID}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))" 2>/dev/null || true)

if [[ -n "${DS_EXISTS}" ]]; then
  warn "Datastore '${DATASTORE_ID}' già esistente — saltato"
else
  DS_RESP=$(_de_post \
    "${COL}/dataStores?dataStoreId=${DATASTORE_ID}" \
    '{
      "displayName": "Moby Prince Corpus",
      "industryVertical": "GENERIC",
      "solutionTypes": ["SOLUTION_TYPE_SEARCH"],
      "contentConfig": "CONTENT_REQUIRED"
    }')
  DS_OP=$(echo "${DS_RESP}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))" 2>/dev/null || true)
  _wait_op "${DS_OP}" "Datastore ${DATASTORE_ID}"
fi

# ── 4b. Engine Vertex AI Search ───────────────────────────────────────────────
step "5 / 6  Vertex AI Search — Engine"

# Refresh token dopo le attese
TOKEN=$(gcloud auth print-access-token)

ENG_EXISTS=$(_de_get "${COL}/engines/${ENGINE_ID}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))" 2>/dev/null || true)

if [[ -n "${ENG_EXISTS}" ]]; then
  warn "Engine '${ENGINE_ID}' già esistente — saltato"
else
  ENG_RESP=$(_de_post \
    "${COL}/engines?engineId=${ENGINE_ID}" \
    "{
      \"displayName\": \"Moby Prince Search\",
      \"dataStoreIds\": [\"${DATASTORE_ID}\"],
      \"solutionType\": \"SOLUTION_TYPE_SEARCH\",
      \"searchEngineConfig\": {
        \"searchTier\": \"SEARCH_TIER_ENTERPRISE\",
        \"searchAddOns\": [\"SEARCH_ADD_ON_LLM\"]
      }
    }")
  ENG_OP=$(echo "${ENG_RESP}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))" 2>/dev/null || true)
  _wait_op "${ENG_OP}" "Engine ${ENGINE_ID}"
fi

# ── 5. Schema metadati ────────────────────────────────────────────────────────
step "6 / 6  Schema metadati Vertex AI Search"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_SCRIPT="${SCRIPT_DIR}/../ingestion/scripts/patch-schema.js"

if [[ -f "${PATCH_SCRIPT}" ]] && command -v node &>/dev/null; then
  # Assicura che le dipendenze ingestion siano installate
  INGESTION_DIR="${SCRIPT_DIR}/../ingestion"
  if [[ ! -d "${INGESTION_DIR}/node_modules" ]]; then
    info "Installazione dipendenze ingestion..."
    (cd "${INGESTION_DIR}" && npm ci --ignore-scripts --quiet)
  fi

  GOOGLE_CLOUD_PROJECT="${PROJECT}" \
  DATA_STORE_ID="${DATASTORE_ID}" \
  GCP_LOCATION="${GCP_LOCATION}" \
    node "${PATCH_SCRIPT}" && ok "Schema applicato" \
    || warn "Schema non applicato — eseguire manualmente: ./deploy/schema.sh"
else
  warn "node o patch-schema.js non trovati."
  warn "Applicare lo schema manualmente dal progetto locale:"
  warn "  DATA_STORE_ID=${DATASTORE_ID} PROJECT=${PROJECT} ./deploy/schema.sh"
fi

# ── Output .env ───────────────────────────────────────────────────────────────
API_KEY_SUGGESTED="$(openssl rand -hex 24 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | fold -w 48 | head -1)"

echo ""
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Setup completato!  Copia queste variabili.     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}▼ Contenuto backend/.env${NC}"
echo "────────────────────────────────────────────────────"
cat <<ENV
GOOGLE_CLOUD_PROJECT=${PROJECT}
GCP_LOCATION=${GCP_LOCATION}
ENGINE_ID=${ENGINE_ID}
DATA_STORE_ID=${DATASTORE_ID}
GCS_BUCKET=${CORPUS_BUCKET}

PORT=3001
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:5173
LOG_LEVEL=debug

# Protezione API (decommenta se vuoi la chiave anche in locale)
# API_KEY=${API_KEY_SUGGESTED}

# Indicizzazione automatica dopo l'upload (richiede GCS + Vertex AI Search)
# AUTO_INGEST=true
ENV
echo "────────────────────────────────────────────────────"
echo ""
echo -e "${BOLD}▼ Contenuto frontend/.env.local${NC}"
echo "────────────────────────────────────────────────────"
cat <<FENV
VITE_API_BASE_URL=http://localhost:3001
# VITE_API_KEY=${API_KEY_SUGGESTED}
FENV
echo "────────────────────────────────────────────────────"
echo ""
echo -e "${BOLD}Prossimi passi:${NC}"
echo "  1. Copia i blocchi .env qui sopra nei file rispettivi"
echo "  2. Sul tuo WSL esegui:  ./scripts/local-verify.sh"
echo "  3. Apri il browser su:  http://localhost:5173"
echo "  4. Carica documenti dal Dossier Builder"
echo ""
echo -e "${BOLD}Link utili:${NC}"
echo "  Vertex AI Search: https://console.cloud.google.com/ai/discovery/engines?project=${PROJECT}"
echo "  GCS bucket:       https://console.cloud.google.com/storage/browser/${CORPUS_BUCKET}"
echo "  Firestore:        https://console.cloud.google.com/firestore?project=${PROJECT}"
echo ""
