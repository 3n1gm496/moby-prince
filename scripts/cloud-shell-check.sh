#!/usr/bin/env bash
# scripts/cloud-shell-check.sh
#
# Eseguire in Google Cloud Shell per verificare la configurazione GCP esistente
# e ottenere i valori da copiare in backend/.env per il deploy locale.
#
# Utilizzo:
#   ./scripts/cloud-shell-check.sh
#
# Non crea né modifica nulla — solo lettura.

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✔${NC}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $*"; }
fail() { echo -e "  ${RED}✖${NC}  $*"; }
sep()  { echo ""; echo -e "${BOLD}$*${NC}"; echo "────────────────────────────────────────────────"; }

# ── Progetto attivo ───────────────────────────────────────────────────────────
PROJECT=$(gcloud config get-value project 2>/dev/null || true)
if [[ -z "$PROJECT" ]]; then
  echo "Nessun progetto GCP attivo. Eseguire prima:"
  echo "  gcloud config set project TUO-PROGETTO-ID"
  exit 1
fi

echo ""
echo -e "${BOLD}Moby Prince — Verifica configurazione GCP${NC}"
echo "Progetto: ${PROJECT}"
echo ""

# ── Token per le chiamate API ─────────────────────────────────────────────────
TOKEN=$(gcloud auth print-access-token 2>/dev/null || true)
if [[ -z "$TOKEN" ]]; then
  echo "Nessuna credenziale attiva. Eseguire:"
  echo "  gcloud auth login"
  exit 1
fi

# ── 1. Vertex AI Search: engines ─────────────────────────────────────────────
sep "1. Vertex AI Search — Engines"

# Prova sia 'eu' che 'global' (le due location più comuni)
ENGINE_ID=""
GCP_LOCATION=""

for LOC in eu global us; do
  RESP=$(curl -sf \
    "https://${LOC}-discoveryengine.googleapis.com/v1/projects/${PROJECT}/locations/${LOC}/collections/default_collection/engines" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || true)

  COUNT=$(echo "$RESP" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(len(d.get('engines',[])))" \
    2>/dev/null || echo 0)

  if [[ "$COUNT" -gt 0 ]]; then
    GCP_LOCATION="$LOC"
    echo ""
    echo "  Trovati ${COUNT} engine in location '${LOC}':"
    echo ""
    echo "$RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for e in d.get('engines', []):
    name  = e.get('name', '')
    eid   = name.split('/')[-1]
    label = e.get('displayName', '')
    tier  = e.get('searchEngineConfig', {}).get('searchTier', 'N/A')
    dsids = ', '.join(e.get('dataStoreIds', []))
    print(f'    ENGINE_ID={eid}')
    print(f'      Nome:       {label}')
    print(f'      Tier:       {tier}')
    print(f'      DataStore:  {dsids}')
    print()
" 2>/dev/null || echo "  (errore parsing risposta)"

    # Prende il primo engine come suggerimento
    ENGINE_ID=$(echo "$RESP" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); e=d['engines'][0]; print(e['name'].split('/')[-1])" \
      2>/dev/null || true)
    break
  fi
done

if [[ -z "$ENGINE_ID" ]]; then
  fail "Nessun engine trovato in eu/global/us."
  warn "Creare un'app su: https://console.cloud.google.com/ai/discovery/engines?project=${PROJECT}"
  GCP_LOCATION="eu"
else
  ok "ENGINE_ID suggerito: ${ENGINE_ID}  (location: ${GCP_LOCATION})"
fi

# ── 2. Vertex AI Search: datastores ──────────────────────────────────────────
sep "2. Vertex AI Search — Datastores"

DATA_STORE_ID=""

if [[ -n "$GCP_LOCATION" ]]; then
  RESP=$(curl -sf \
    "https://${GCP_LOCATION}-discoveryengine.googleapis.com/v1/projects/${PROJECT}/locations/${GCP_LOCATION}/collections/default_collection/dataStores" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || true)

  COUNT=$(echo "$RESP" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(len(d.get('dataStores',[])))" \
    2>/dev/null || echo 0)

  if [[ "$COUNT" -gt 0 ]]; then
    echo ""
    echo "  Trovati ${COUNT} datastore in '${GCP_LOCATION}':"
    echo ""
    echo "$RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for ds in d.get('dataStores', []):
    name  = ds.get('name', '')
    dsid  = name.split('/')[-1]
    label = ds.get('displayName', '')
    cfg   = ds.get('contentConfig', 'N/A')
    print(f'    DATA_STORE_ID={dsid}')
    print(f'      Nome:          {label}')
    print(f'      ContentConfig: {cfg}')
    print()
" 2>/dev/null

    DATA_STORE_ID=$(echo "$RESP" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); ds=d['dataStores'][0]; print(ds['name'].split('/')[-1])" \
      2>/dev/null || true)
    ok "DATA_STORE_ID suggerito: ${DATA_STORE_ID}"
  else
    fail "Nessun datastore trovato in '${GCP_LOCATION}'"
  fi
fi

# ── 3. GCS buckets ────────────────────────────────────────────────────────────
sep "3. Google Cloud Storage — Buckets"

GCS_BUCKET=""

BUCKETS=$(gcloud storage buckets list --project="${PROJECT}" \
  --format="value(name)" 2>/dev/null || true)

if [[ -z "$BUCKETS" ]]; then
  fail "Nessun bucket GCS trovato nel progetto."
  warn "Creare un bucket su: https://console.cloud.google.com/storage?project=${PROJECT}"
else
  echo ""
  while IFS= read -r BUCKET; do
    [[ -z "$BUCKET" ]] && continue
    echo "    gs://${BUCKET}"
    # Suggerisce il bucket che contiene 'corpus' o 'raw' nel nome
    if [[ "$BUCKET" =~ corpus|raw|document|archive ]]; then
      GCS_BUCKET="$BUCKET"
    fi
  done <<< "$BUCKETS"

  # Se non trovato per nome, prende il primo
  [[ -z "$GCS_BUCKET" ]] && GCS_BUCKET=$(echo "$BUCKETS" | head -1)
  echo ""
  ok "GCS_BUCKET suggerito: ${GCS_BUCKET}"
  warn "Verifica che sia il bucket giusto tra quelli elencati sopra"
fi

# ── 4. Firestore ──────────────────────────────────────────────────────────────
sep "4. Firestore"

FS_INFO=$(gcloud firestore databases list --project="${PROJECT}" \
  --format="table(name,locationId,type)" 2>/dev/null || true)

if [[ -z "$FS_INFO" ]] || echo "$FS_INFO" | grep -q "Listed 0"; then
  fail "Nessun database Firestore trovato."
  warn "Creare su: https://console.cloud.google.com/firestore?project=${PROJECT}"
  FIRESTORE_DB="(default)"
else
  echo ""
  echo "$FS_INFO" | sed 's/^/    /'
  FIRESTORE_DB="(default)"
  ok "Firestore presente — FIRESTORE_DB=${FIRESTORE_DB}"
fi

# ── 5. Test connettività Vertex AI Search ─────────────────────────────────────
sep "5. Test connettività Vertex AI Search"

if [[ -n "$ENGINE_ID" && -n "$GCP_LOCATION" ]]; then
  SEARCH_RESP=$(curl -sf -X POST \
    "https://${GCP_LOCATION}-discoveryengine.googleapis.com/v1/projects/${PROJECT}/locations/${GCP_LOCATION}/collections/default_collection/engines/${ENGINE_ID}/servingConfigs/default_serving_config:search" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"query":"test","pageSize":1}' 2>/dev/null || true)

  if echo "$SEARCH_RESP" | python3 -c "import sys,json; json.load(sys.stdin)" &>/dev/null 2>&1; then
    TOTAL=$(echo "$SEARCH_RESP" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(d.get('totalSize', 0))" 2>/dev/null || echo "?")
    ok "Search API raggiungibile — documenti indicizzati: ${TOTAL}"
    [[ "$TOTAL" == "0" ]] && warn "Il corpus è vuoto — carica documenti dopo aver avviato l'app"
  else
    fail "Search API non ha risposto correttamente"
    warn "Risposta: $(echo "$SEARCH_RESP" | head -c 200)"
  fi
else
  warn "Skipped (ENGINE_ID non trovato)"
fi

# ── 6. Credenziali ADC ───────────────────────────────────────────────────────
sep "6. Credenziali Application Default (ADC)"

ADC_FILE="${HOME}/.config/gcloud/application_default_credentials.json"
if [[ -f "$ADC_FILE" ]]; then
  ADC_TYPE=$(python3 -c \
    "import json; d=json.load(open('${ADC_FILE}')); print(d.get('type','?'))" 2>/dev/null || echo "?")
  ok "ADC presente: ${ADC_FILE}  (type: ${ADC_TYPE})"
  ok "Funziona su WSL se hai Docker Desktop o monti ~/.config/gcloud"
else
  warn "ADC non trovate in ${ADC_FILE}"
  echo ""
  echo "  Eseguire in Cloud Shell (o sul WSL):"
  echo "    gcloud auth application-default login"
fi

# ── Riepilogo: blocco .env ────────────────────────────────────────────────────
echo ""
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Copia questo blocco in  backend/.env  sul tuo PC/WSL  ${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"
echo ""
cat <<ENV
GOOGLE_CLOUD_PROJECT=${PROJECT}
GCP_LOCATION=${GCP_LOCATION:-eu}
ENGINE_ID=${ENGINE_ID:-<INCOLLA_QUI_ENGINE_ID>}
DATA_STORE_ID=${DATA_STORE_ID:-<INCOLLA_QUI_DATASTORE_ID>}
GCS_BUCKET=${GCS_BUCKET:-<INCOLLA_QUI_NOME_BUCKET>}

PORT=3001
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:5173
LOG_LEVEL=debug

# AUTO_INGEST=true   # decommenta per indicizzare automaticamente dopo l'upload
ENV

echo ""
echo -e "${BOLD}Poi sul WSL, dalla root del progetto:${NC}"
echo ""
echo "  1. gcloud auth application-default login"
echo "  2. cd backend && npm install"
echo "  3. node server.js"
echo ""
echo "  In un altro terminale:"
echo "  4. cd frontend && npm install && npm run dev"
echo ""
echo -e "${BOLD}Verifica che funzioni:${NC}"
echo "  curl http://localhost:3001/api/health"
echo ""
