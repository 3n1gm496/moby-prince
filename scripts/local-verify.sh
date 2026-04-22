#!/usr/bin/env bash
# scripts/local-verify.sh
#
# Verifica l'ambiente locale WSL, avvia backend e frontend,
# ed esegue una batteria di smoke test sugli endpoint.
#
# Utilizzo:
#   ./scripts/local-verify.sh            # avvia i servizi e verifica
#   ./scripts/local-verify.sh --check    # verifica senza avviare (servizi già in esecuzione)
#   ./scripts/local-verify.sh --stop     # ferma i processi avviati in precedenza
#
# I log dei servizi vengono scritti in:
#   /tmp/moby-backend.log
#   /tmp/moby-frontend.log

set -euo pipefail

# ── Colori e utility ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
ok()     { echo -e "  ${GREEN}✔${NC}  $*"; }
fail()   { echo -e "  ${RED}✖${NC}  $*"; FAILURES=$((FAILURES + 1)); }
warn()   { echo -e "  ${YELLOW}⚠${NC}  $*"; }
info()   { echo -e "  ${BLUE}▶${NC}  $*"; }
step()   { echo ""; echo -e "${BOLD}── $* ──────────────────────────────────${NC}"; }
FAILURES=0

# ── Percorsi ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/backend"
FRONTEND_DIR="${REPO_ROOT}/frontend"
INGESTION_DIR="${REPO_ROOT}/ingestion"

PID_FILE="/tmp/moby-prince-pids"

# ── Argomenti ─────────────────────────────────────────────────────────────────
MODE="${1:-}"   # --check | --stop | (vuoto = avvia + verifica)

# ── Stop mode ─────────────────────────────────────────────────────────────────
if [[ "$MODE" == "--stop" ]]; then
  if [[ -f "$PID_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$PID_FILE"
    echo "Fermo i servizi..."
    [[ -n "${BACKEND_PID:-}"  ]] && kill "${BACKEND_PID}"  2>/dev/null && echo "  Backend  (PID ${BACKEND_PID}) fermato" || true
    [[ -n "${FRONTEND_PID:-}" ]] && kill "${FRONTEND_PID}" 2>/dev/null && echo "  Frontend (PID ${FRONTEND_PID}) fermato" || true
    rm -f "$PID_FILE"
  else
    echo "Nessun PID salvato in ${PID_FILE}."
  fi
  exit 0
fi

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Moby Prince — Verifica ambiente locale (WSL)   ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"

# ── 1. Prerequisiti ───────────────────────────────────────────────────────────
step "1/6  Prerequisiti di sistema"

# Node.js >= 18
if ! command -v node &>/dev/null; then
  fail "Node.js non trovato  →  https://nodejs.org (v18+)"
  exit 1
fi
NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
NODE_MAJOR=$(echo "${NODE_VER}" | cut -d. -f1)
if [[ "${NODE_MAJOR}" -lt 18 ]]; then
  fail "Node.js >= 18 richiesto (trovato: ${NODE_VER})"
  exit 1
fi
ok "Node.js ${NODE_VER}"

# npm
command -v npm &>/dev/null && ok "npm $(npm --version)" \
  || { fail "npm non trovato"; exit 1; }

# gcloud
if command -v gcloud &>/dev/null; then
  GCLOUD_VER=$(gcloud version 2>/dev/null | head -1 | awk '{print $NF}' || echo "?")
  ok "gcloud ${GCLOUD_VER}"
else
  fail "gcloud CLI non trovato  →  https://cloud.google.com/sdk/docs/install"
  exit 1
fi

# curl (per i test)
command -v curl &>/dev/null && ok "curl disponibile" \
  || { fail "curl non trovato  →  sudo apt install curl"; exit 1; }

# python3 (per il parsing JSON nei test)
command -v python3 &>/dev/null && ok "python3 disponibile" \
  || warn "python3 non trovato — i test JSON saranno limitati"

# ── 2. File .env ──────────────────────────────────────────────────────────────
step "2/6  Configurazione (.env)"

if [[ ! -f "${BACKEND_DIR}/.env" ]]; then
  fail "backend/.env non trovato"
  echo ""
  echo "  Crea il file con:"
  echo "    cp ${BACKEND_DIR}/.env.example ${BACKEND_DIR}/.env"
  echo "  poi compila almeno GOOGLE_CLOUD_PROJECT e ENGINE_ID"
  echo "  (usa i valori stampati da scripts/cloud-shell-setup.sh)"
  exit 1
fi
ok "backend/.env trovato"

# Carica le variabili in modo sicuro (ignora commenti e righe vuote)
while IFS='=' read -r KEY VALUE; do
  # Salta commenti e righe vuote
  [[ -z "$KEY" || "$KEY" =~ ^[[:space:]]*# ]] && continue
  KEY="${KEY//[[:space:]]/}"
  VALUE="${VALUE%%#*}"    # rimuove commenti inline
  VALUE="${VALUE%"${VALUE##*[![:space:]]}"}"  # trim trailing spaces
  [[ -z "$KEY" ]] && continue
  export "${KEY}=${VALUE}" 2>/dev/null || true
done < "${BACKEND_DIR}/.env"

# Variabili obbligatorie
REQUIRED_MISSING=0
for VAR in GOOGLE_CLOUD_PROJECT ENGINE_ID; do
  VAL="${!VAR:-}"
  if [[ -z "$VAL" ]]; then
    fail "${VAR} non impostato in backend/.env"
    REQUIRED_MISSING=1
  else
    ok "${VAR}=${VAL}"
  fi
done
[[ $REQUIRED_MISSING -eq 1 ]] && { echo ""; echo "  Compila le variabili mancanti e riprova."; exit 1; }

# Variabili opzionali
[[ -n "${DATA_STORE_ID:-}" ]] && ok "DATA_STORE_ID=${DATA_STORE_ID}" \
  || warn "DATA_STORE_ID non impostato (chunk lookup e auto-ingest disabilitati)"
[[ -n "${GCS_BUCKET:-}" ]] && ok "GCS_BUCKET=${GCS_BUCKET}" \
  || warn "GCS_BUCKET non impostato (storage browser disabilitato)"
[[ "${AUTO_INGEST:-}" == "true" ]] && ok "AUTO_INGEST=true (indicizzazione automatica attiva)" \
  || info "AUTO_INGEST non attivo (upload non indicizza automaticamente)"
[[ -n "${API_KEY:-}" ]] && ok "API_KEY impostata" \
  || info "API_KEY non impostata (endpoint pubblici — va bene in locale)"

BACKEND_PORT="${PORT:-3001}"
BACKEND_URL="http://localhost:${BACKEND_PORT}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
FRONTEND_URL="http://localhost:${FRONTEND_PORT}"

# ── 3. Autenticazione GCP ─────────────────────────────────────────────────────
step "3/6  Credenziali GCP (Application Default Credentials)"

if gcloud auth application-default print-access-token &>/dev/null; then
  ADC_ACCOUNT=$(gcloud config get-value account 2>/dev/null || echo "?")
  ok "ADC attive — account: ${ADC_ACCOUNT}"

  # Verifica che il progetto corrisponda
  ADC_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")
  if [[ -n "$ADC_PROJECT" && "$ADC_PROJECT" != "${GOOGLE_CLOUD_PROJECT}" ]]; then
    warn "Progetto gcloud (${ADC_PROJECT}) ≠ GOOGLE_CLOUD_PROJECT (${GOOGLE_CLOUD_PROJECT})"
    warn "Eseguire: gcloud config set project ${GOOGLE_CLOUD_PROJECT}"
  fi
else
  warn "ADC non configurate. Avvio login..."
  echo ""
  gcloud auth application-default login --project="${GOOGLE_CLOUD_PROJECT}"
fi

# ── 4. Dipendenze npm ─────────────────────────────────────────────────────────
step "4/6  Dipendenze npm"

if [[ ! -d "${BACKEND_DIR}/node_modules" ]]; then
  info "Installazione dipendenze backend..."
  (cd "${BACKEND_DIR}" && npm ci --omit=dev --ignore-scripts --quiet)
fi
ok "Backend node_modules OK"

if [[ ! -d "${FRONTEND_DIR}/node_modules" ]]; then
  info "Installazione dipendenze frontend..."
  (cd "${FRONTEND_DIR}" && npm ci --ignore-scripts --quiet)
fi
ok "Frontend node_modules OK"

# Dipendenze ingestion (necessarie se AUTO_INGEST=true)
if [[ "${AUTO_INGEST:-}" == "true" && ! -d "${INGESTION_DIR}/node_modules" ]]; then
  info "Installazione dipendenze ingestion (richieste da AUTO_INGEST)..."
  (cd "${INGESTION_DIR}" && npm ci --ignore-scripts --quiet)
  ok "Ingestion node_modules OK"
elif [[ -d "${INGESTION_DIR}/node_modules" ]]; then
  ok "Ingestion node_modules OK"
fi

# ── 5. Avvio servizi ──────────────────────────────────────────────────────────
if [[ "$MODE" == "--check" ]]; then
  step "5/6  Verifica servizi (--check: skip avvio)"
  info "Assumo che backend e frontend siano già in esecuzione"
else
  step "5/6  Avvio servizi"

  _kill_port() {
    local PORT="$1"
    # lsof potrebbe non essere disponibile su WSL base
    if command -v lsof &>/dev/null; then
      local PIDS
      PIDS=$(lsof -ti:"${PORT}" 2>/dev/null || true)
      [[ -n "$PIDS" ]] && echo "${PIDS}" | xargs kill -9 2>/dev/null && sleep 1 || true
    elif command -v fuser &>/dev/null; then
      fuser -k "${PORT}/tcp" 2>/dev/null || true
      sleep 1
    fi
  }

  # ── Backend ──
  _kill_port "${BACKEND_PORT}"

  info "Avvio backend su :${BACKEND_PORT}..."
  (
    cd "${BACKEND_DIR}"
    NODE_ENV=development node server.js
  ) >> /tmp/moby-backend.log 2>&1 &
  BACKEND_PID=$!

  # Attende che il backend risponda
  info "Attesa backend (max 30s)..."
  ATTEMPTS=0
  until curl -sf "${BACKEND_URL}/api/health" -o /dev/null 2>/dev/null; do
    sleep 1
    ATTEMPTS=$((ATTEMPTS + 1))
    if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
      fail "Il processo backend è terminato inaspettatamente"
      echo ""
      echo "  Ultimi log (/tmp/moby-backend.log):"
      tail -20 /tmp/moby-backend.log 2>/dev/null | sed 's/^/    /'
      exit 1
    fi
    if [[ $ATTEMPTS -ge 30 ]]; then
      fail "Backend non risponde (timeout 30s)"
      echo ""
      echo "  Ultimi log (/tmp/moby-backend.log):"
      tail -20 /tmp/moby-backend.log 2>/dev/null | sed 's/^/    /'
      exit 1
    fi
  done
  ok "Backend avviato (PID ${BACKEND_PID})"

  # ── Frontend ──
  _kill_port "${FRONTEND_PORT}"

  info "Avvio frontend su :${FRONTEND_PORT}..."
  (
    cd "${FRONTEND_DIR}"
    VITE_API_BASE_URL="${BACKEND_URL}" \
    npm run dev -- --host 0.0.0.0 --port "${FRONTEND_PORT}" --strictPort
  ) >> /tmp/moby-frontend.log 2>&1 &
  FRONTEND_PID=$!

  # Attende che il frontend risponda
  info "Attesa frontend (max 30s)..."
  ATTEMPTS=0
  until curl -sf "${FRONTEND_URL}" -o /dev/null 2>/dev/null; do
    sleep 1
    ATTEMPTS=$((ATTEMPTS + 1))
    if ! kill -0 "${FRONTEND_PID}" 2>/dev/null; then
      fail "Il processo frontend è terminato inaspettatamente"
      echo ""
      echo "  Ultimi log (/tmp/moby-frontend.log):"
      tail -15 /tmp/moby-frontend.log 2>/dev/null | sed 's/^/    /'
      exit 1
    fi
    if [[ $ATTEMPTS -ge 30 ]]; then
      fail "Frontend non risponde (timeout 30s)"
      tail -10 /tmp/moby-frontend.log 2>/dev/null | sed 's/^/    /'
      exit 1
    fi
  done
  ok "Frontend avviato (PID ${FRONTEND_PID})"

  # Salva i PID per poterli fermare con --stop
  printf "BACKEND_PID=%s\nFRONTEND_PID=%s\n" "${BACKEND_PID}" "${FRONTEND_PID}" > "$PID_FILE"
fi

# ── 6. Smoke test endpoint ───────────────────────────────────────────────────
step "6/6  Verifica endpoint"

# Header opzionale con API key
CURL_AUTH=()
[[ -n "${API_KEY:-}" ]] && CURL_AUTH=(-H "X-API-Key: ${API_KEY}")

_http_status() {
  curl -so /dev/null -w "%{http_code}" "${CURL_AUTH[@]}" "$@" 2>/dev/null || echo "000"
}
_json_field() {
  # Estrae un campo JSON se python3 è disponibile
  local URL="$1" FIELD="$2"
  curl -sf "${CURL_AUTH[@]}" "$URL" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('${FIELD}','?'))" \
    2>/dev/null || echo "?"
}

# ── GET /api/health ──
HEALTH_STATUS=$(_json_field "${BACKEND_URL}/api/health" "status")
AUTH_STATUS=$(_json_field "${BACKEND_URL}/api/health" "auth")
UPTIME=$(_json_field "${BACKEND_URL}/api/health" "uptimeMs")
if [[ "$HEALTH_STATUS" == "ok" ]]; then
  ok "GET /api/health → status=${HEALTH_STATUS}  auth=${AUTH_STATUS}  uptime=${UPTIME}ms"
elif [[ "$HEALTH_STATUS" == "degraded" ]]; then
  warn "GET /api/health → status=degraded  auth=${AUTH_STATUS}"
  warn "  Le credenziali GCP potrebbero non funzionare — verificare ADC"
else
  fail "GET /api/health → risposta inattesa: ${HEALTH_STATUS}"
fi

# ── GET /api/filters ──
STATUS=$(_http_status "${BACKEND_URL}/api/filters")
[[ "$STATUS" == "200" ]] \
  && ok "GET /api/filters → 200" \
  || fail "GET /api/filters → ${STATUS}"

# ── POST /api/search ──
SEARCH_RESP=$(curl -sf "${CURL_AUTH[@]}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"moby prince","filters":{}}' \
  "${BACKEND_URL}/api/search" 2>/dev/null || true)
if [[ -n "$SEARCH_RESP" ]]; then
  COUNT=$(echo "$SEARCH_RESP" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print(len(r.get('results',[])))" \
    2>/dev/null || echo "?")
  ok "POST /api/search → ${COUNT} risultati"
  [[ "$COUNT" == "0" ]] && warn "  Nessun documento nel datastore — carica documenti dal Dossier Builder"
else
  warn "POST /api/search → nessuna risposta (Vertex AI Search potrebbe non essere raggiungibile)"
fi

# ── GET /api/storage/browse ── (solo se GCS configurato)
if [[ -n "${GCS_BUCKET:-}" ]]; then
  STATUS=$(_http_status "${BACKEND_URL}/api/storage/browse?prefix=")
  [[ "$STATUS" == "200" ]] \
    && ok "GET /api/storage/browse → 200  (bucket: ${GCS_BUCKET})" \
    || fail "GET /api/storage/browse → ${STATUS}"
else
  info "GET /api/storage/browse — saltato (GCS_BUCKET non configurato)"
fi

# ── GET /api/admin/stats __ (solo se API_KEY impostata)
if [[ -n "${API_KEY:-}" ]]; then
  STATUS=$(_http_status "${BACKEND_URL}/api/admin/stats")
  [[ "$STATUS" == "200" ]] \
    && ok "GET /api/admin/stats → 200" \
    || fail "GET /api/admin/stats → ${STATUS}"
fi

# ── Verifica ingestion pipeline (solo se AUTO_INGEST=true) ──
if [[ "${AUTO_INGEST:-}" == "true" ]]; then
  ENTRY="${INGESTION_DIR}/cloudrun/entrypoint.js"
  if [[ -f "$ENTRY" ]]; then
    ok "Auto-ingest: entrypoint.js trovato"
  else
    fail "Auto-ingest: ${ENTRY} non trovato"
  fi
  if [[ -d "${INGESTION_DIR}/node_modules" ]]; then
    ok "Auto-ingest: dipendenze ingestion presenti"
  else
    fail "Auto-ingest: node_modules ingestion mancanti  →  cd ingestion && npm ci"
  fi
fi

# ── Riepilogo ─────────────────────────────────────────────────────────────────
echo ""
if [[ $FAILURES -eq 0 ]]; then
  # Recupera IP LAN per accesso dalla rete locale
  LAN_IP=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $7; exit}' \
    || hostname -I 2>/dev/null | awk '{print $1}' || echo "")

  echo -e "${GREEN}${BOLD}  Tutto OK!${NC}"
  echo ""
  echo "  ┌─ Accesso locale ─────────────────────────────────────┐"
  echo "  │  Frontend : ${FRONTEND_URL}"
  echo "  │  Backend  : ${BACKEND_URL}/api/health"
  if [[ -n "$LAN_IP" && "$LAN_IP" != "127.0.0.1" ]]; then
    echo "  ├─ Accesso rete LAN (stesso Wi-Fi) ────────────────────┤"
    echo "  │  Frontend : http://${LAN_IP}:${FRONTEND_PORT}"
    echo "  │  Backend  : http://${LAN_IP}:${BACKEND_PORT}/api/health"
  fi
  echo "  └──────────────────────────────────────────────────────┘"
  echo ""
  if [[ "$MODE" != "--check" ]]; then
    echo "  Log:  tail -f /tmp/moby-backend.log"
    echo "        tail -f /tmp/moby-frontend.log"
    echo ""
    echo "  Stop: ./scripts/local-verify.sh --stop"
    echo "        (oppure Ctrl+C)"
    echo ""
    echo -e "  ${BOLD}Premi Ctrl+C per fermare entrambi i servizi.${NC}"
    echo ""
    # Aspetta i processi figli
    wait "${BACKEND_PID}" "${FRONTEND_PID}" 2>/dev/null || true
  fi
else
  echo -e "${RED}${BOLD}  ${FAILURES} test falliti.${NC}"
  echo ""
  echo "  Controlla i log:"
  echo "    tail -30 /tmp/moby-backend.log"
  echo "    tail -30 /tmp/moby-frontend.log"
  echo ""
  exit 1
fi
