# Archivio Moby Prince

> Piattaforma investigativa RAG per il corpus documentale sul disastro del Moby Prince (10 aprile 1991) — testimonianze, perizie, atti parlamentari, materiali audio/video. Permette interrogazione in linguaggio naturale, rilevamento automatico di contraddizioni, analisi multi-step tramite agente AI e persistenza delle sessioni di indagine.

![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Vertex AI Search](https://img.shields.io/badge/Vertex%20AI%20Search-v1-4285F4?logo=googlecloud&logoColor=white)
![BigQuery](https://img.shields.io/badge/BigQuery-evidence%20layer-4285F4?logo=googlebigquery&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-2.0%20Flash-8B5CF6?logo=googlegemini&logoColor=white)

---

## Architettura generale

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend — React 18 + Vite + Tailwind                      │
│  Chat · Timeline · Dossier · Contraddizioni · Investigazione │
└────────────────────────┬────────────────────────────────────┘
                         │ /api/*  (SSE + REST)
┌────────────────────────▼────────────────────────────────────┐
│  Backend — Node.js 20 + Express 4                           │
│  answer · search · evidence · agent · contradictions         │
│  entities · events · sessions · timeline · media · storage   │
└──┬──────────────┬───────────────┬───────────────────────────┘
   │              │               │
   ▼              ▼               ▼
Vertex AI      BigQuery        Firestore
Search         evidence        sessions
(RAG core)     layer           persistence
   │
   ▼
Cloud Storage   ◄── Ingestion pipeline (Cloud Run Job)
(corpus GCS)        Validator → DocAI → MediaProcessor
                    → Splitter → EntityExtractor
                    → Indexer → ClaimExtractor
```

---

## Quick start (Docker)

**Prerequisiti:** Docker, `gcloud` CLI, progetto GCP con Vertex AI Search configurato.

```bash
# 1 — Credenziali Google (una volta sola)
gcloud auth application-default login

# 2 — Configurazione backend
cp backend/.env.example backend/.env
# Compilare almeno: GOOGLE_CLOUD_PROJECT, ENGINE_ID

# 3 — Avvio
docker compose up --build
# → http://localhost:5173
```

Il frontend nginx fa da reverse proxy per `/api/*` verso il backend sulla rete interna Docker. Nessuna configurazione aggiuntiva necessaria per il routing.

---

## Interfaccia utente

| Pagina | Route | Funzione |
|--------|-------|---------|
| **Chat** | `/` | Interrogazione RAG in linguaggio naturale con citazioni ancorate ai documenti originali, domande correlate, badge grounding e pannello contraddizioni rilevanti |
| **Timeline** | `/timeline` | Linea del tempo interattiva degli eventi; sorgente BigQuery (se disponibile) con fallback GCS; generazione AI dei punti salienti |
| **Dossier** | `/dossier` | Costruttore di dossier investigativi con selezione manuale di evidenze |
| **Contraddizioni** | `/contraddizioni` | Matrice delle contraddizioni rilevate tra claim; filtri per stato/gravità; aggiornamento status direttamente dal pannello |
| **Investigazione** | `/investigazione` | Agente multi-step Gemini 2.0 Flash con traccia visuale dei tool call; query pre-caricate sui nodi chiave del caso |

---

## API Backend

Tutti gli endpoint sono sotto `/api/` e richiedono l'header `X-API-Key` quando `API_KEY` è configurata. Il backend risponde a `http://localhost:3001` in sviluppo, su `http://localhost:5173/api/` tramite proxy Docker.

### Risposta (RAG)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `POST` | `/api/answer` | Risposta fondata con citazioni — **SSE** (`event: thinking` → `event: answer` → `event: contradictions`) |
| `POST` | `/api/ask` | Alias `/api/answer` (compatibilità) |
| `POST` | `/api/search` | Ricerca chunk/documenti senza generazione di risposta |

**Corpo `/api/answer`:**
```json
{
  "query": "Quali testimoni contraddicono la perizia RINA sulla visibilità?",
  "sessionId": "abc123",
  "filters": { "documentType": "testimony", "year": 1991 }
}
```

**Sequenza SSE:**
```
event: thinking     data: {"stage":"searching"}
event: answer       data: { answer, session, meta }
event: contradictions data: [{ id, severity, description, ... }]
event: grounding    data: [{ score, sourceChunkId, ... }]
```

### Evidence e filtri

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `POST` | `/api/evidence/search` | Lista piatta di chunk per il workbench |
| `GET`  | `/api/evidence/documents/:id/chunks` | Tutti i chunk di un documento (richiede `DATA_STORE_ID`) |
| `GET`  | `/api/evidence/chunks-by-gcs-path?path=` | Lookup per percorso GCS |
| `GET`  | `/api/filters/schema` | Schema filtri a runtime (evita duplicazione con il frontend) |

### Timeline

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `GET`  | `/api/timeline/documents` | Tutti i documenti con metadati anno/tipo |
| `GET`  | `/api/timeline/events` | Eventi ordinati; sorgente BigQuery → GCS → vuoto |
| `PUT`  | `/api/timeline/events` | Salva array eventi su GCS |
| `POST` | `/api/timeline/generate` | Genera eventi storici via AI (DE → parser → GCS) |

### Media (M2)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `GET`  | `/api/media/:id/transcript` | Trascrizione con timestamp |
| `GET`  | `/api/media/:id/shots` | Shot list + URL firmati GCS thumbnail |
| `GET`  | `/api/media/:id/labels` | Label e oggetti da Vision / Video Intelligence |

### Entità e eventi (M3–M4 — richiede BigQuery)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `GET`  | `/api/entities` | Lista entità con conteggio citazioni |
| `GET`  | `/api/entities/search?q=` | Ricerca per nome / alias |
| `GET`  | `/api/entities/:id` | Dettaglio entità |
| `GET`  | `/api/entities/:id/claims` | Claim cross-documento che citano l'entità |
| `GET`  | `/api/entities/:id/events` | Timeline eventi associati |
| `GET`  | `/api/events` | Lista eventi (`?from=&to=&type=`) |
| `GET`  | `/api/events/:id` | Dettaglio evento |

### Contraddizioni e claim (M5 — richiede BigQuery)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `GET`  | `/api/contradictions` | Lista (`?status=&severity=&documentId=`) |
| `GET`  | `/api/contradictions/:id` | Dettaglio con testo claim A/B |
| `PATCH`| `/api/contradictions/:id` | Aggiorna `status` / `resolution` |
| `POST` | `/api/contradictions/detect` | Attiva rilevamento pairwise su un documento o set di claim |
| `GET`  | `/api/claims?documentId=` | Claim per documento |
| `POST` | `/api/claims/verify` | Verifica un testo libero contro i claim archiviati |
| `GET`  | `/api/claims/:id` | Dettaglio claim |

### Sessioni investigative (M6 — richiede Firestore)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `POST` | `/api/sessions` | Crea sessione |
| `GET`  | `/api/sessions` | Lista sessioni (senza messaggi) |
| `GET`  | `/api/sessions/:id` | Dettaglio + messaggi |
| `PATCH`| `/api/sessions/:id` | Aggiorna titolo / `deSessionId` / sostituisce messaggi |
| `POST` | `/api/sessions/:id/messages` | **Append atomico** di un messaggio (Firestore FieldTransform — sicuro da tab concorrenti) |
| `DELETE`| `/api/sessions/:id` | Elimina sessione |
| `GET`  | `/api/sessions/:id/export` | Download JSON allegato |

### Agente multi-step (M6)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `POST` | `/api/agent/investigate` | Avvia indagine — **SSE** con traccia dei tool call |

**Sequenza SSE agente:**
```
event: thinking     data: {"step": 1}
event: tool_call    data: {"tool": "search_documents", "args": {...}, "step": 1}
event: tool_result  data: {"tool": "...", "result": {...}, "durationMs": 312, "step": 1}
event: answer       data: {"text": "...", "steps": [...]}
event: error        data: {"message": "..."}
```

**Tool disponibili all'agente:** `search_documents`, `verify_claim`, `list_contradictions`, `get_entity_info`, `translate_text`.

### Storage, analisi e health

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `GET`  | `/api/storage` | Lista oggetti GCS del corpus |
| `POST` | `/api/storage/upload` | Upload documento |
| `PATCH`| `/api/storage/:path` | Rinomina / aggiorna metadati (sincronizza GCS → DE) |
| `DELETE`| `/api/storage/:path` | Elimina documento |
| `POST` | `/api/analysis` | Analisi comparativa multi-documento |
| `GET`  | `/api/health` | Liveness probe → `{"status":"ok"}` |

---

## Configurazione backend (`backend/.env`)

| Variabile | Obbligo | Default | Descrizione |
|-----------|---------|---------|-------------|
| `GOOGLE_CLOUD_PROJECT` | **sì** | — | GCP project ID |
| `ENGINE_ID` | **sì** | — | Vertex AI Search engine ID |
| `GCP_LOCATION` | no | `eu` | Regione DE (`eu` · `global` · `us`) |
| `DATA_STORE_ID` | no | — | Abilita chunk/document lookup |
| `GCS_BUCKET` | no | — | Bucket corpus — abilita storage API |
| `API_KEY` | no | — | Chiave per proteggere tutti gli endpoint `/api/*` |
| `FRONTEND_ORIGIN` | no | `http://localhost:5173` | CORS origin |
| `PORT` | no | `3001` | Porta HTTP |
| `NODE_ENV` | no | `development` | `production` → log NDJSON strutturato |
| `LOG_LEVEL` | no | `debug` | `debug` · `info` · `warn` · `error` |
| `CHUNK_CONTEXT_PREV` | no | `1` | Chunk precedenti per risposta |
| `CHUNK_CONTEXT_NEXT` | no | `1` | Chunk successivi per risposta |
| `BQ_PROJECT_ID` | no | `GOOGLE_CLOUD_PROJECT` | Progetto BigQuery |
| `BQ_DATASET_ID` | no | `evidence` | Dataset evidence layer |
| `BQ_LOCATION` | no | `EU` | Regione BigQuery |
| `FIRESTORE_DB` | no | `(default)` | Database Firestore sessioni |
| `GEMINI_LOCATION` | no | `us-central1` | Regione Vertex AI / Gemini |

---

## Evidence layer — BigQuery

Quando `BQ_PROJECT_ID` è configurato si attiva il livello di analisi strutturata. Il DDL completo è in `docs/bigquery-schema.sql`.

```bash
# Prima configurazione
bq mk --dataset --location=EU ${PROJECT_ID}:evidence
bq query --nouse_legacy_sql < docs/bigquery-schema.sql
```

**Tabelle:**

| Tabella | Contenuto |
|---------|-----------|
| `evidence.documents` | Specchio metadati DE — tipo, istituzione, anno, qualità OCR |
| `evidence.chunks` | Chunk indicizzati con riferimento pagina |
| `evidence.entities` | Entità estratte (PERSON, ORGANIZATION, VESSEL, LOCATION) con alias canonici |
| `evidence.events` | Cronologia eventi con coordinate temporali |
| `evidence.claims` | Affermazioni fattuali estratte da Gemini, con `document_id` = ID DE reale |
| `evidence.evidence_links` | Join claim → entità / evento |
| `evidence.contradictions` | Contraddizioni rilevate pairwise con severity e stato revisione |

**Rilevamento contraddizioni** — pre-filtro semantico tramite `text-embedding-004` (soglia coseno 0.45) prima di ogni chiamata Gemini pairwise. Se gli embedding non sono disponibili il sistema degrada silenziosamente al filtro per `entity_id` condivisi.

**IAM minimi:**
```
ingestion SA : roles/bigquery.dataEditor
backend SA   : roles/bigquery.dataViewer
```

---

## Pipeline di ingestion

```
GCS raw/*.pdf  →  Validator  →  DocumentAI (Layout Parser, PDF > 50 MB)
                              →  MediaProcessor (Vision · Video Intelligence · STT)
                              →  Splitter (parti > 2 MB)
                              →  EntityExtractor (Natural Language API)
                              →  IndexerWorker (PUT su Discovery Engine)
                              →  ClaimExtractorWorker (Gemini Flash → BQ evidence.claims)
```

Il `ClaimExtractorWorker` gira **dopo** l'`IndexerWorker` così ogni claim riceve come `document_id` l'ID DE reale (non il job UUID temporaneo).

**Comandi principali:**

```bash
cd ingestion
cp .env.example .env

# Ingestione singolo file (dry run — non scrive su DE)
INDEX_DRY_RUN=true node cloudrun/entrypoint.js ingest ./corpus/raw/documento.pdf

# Scan di un bucket GCS
node cloudrun/entrypoint.js scan gs://my-project-corpus-raw/moby-prince/

# Retry dei job falliti
node cloudrun/entrypoint.js retry

# Importazione con manifest (metadati espliciti)
node ingestion/scripts/import-documents.js --manifest corpus.jsonl
```

**Worker e MIME supportati:**

| Worker | Attivazione |
|--------|-------------|
| `DocumentAIWorker` | PDF ≥ soglia (`SPLIT_PDF_WARN`, default 10 MB) |
| `MediaProcessorWorker` | `image/*` · `video/*` · `audio/*` |
| `SplitterWorker` | PDF/testo > `SPLIT_MAX_BYTES` (2 MB) |
| `EntityExtractionWorker` | Testo plain/markdown |
| `IndexerWorker` | Tutti i tipi in stato VALIDATING/INDEXING |
| `ClaimExtractorWorker` | Testo plain/markdown dopo INDEXED |

### Configurazione ingestion (`ingestion/.env`)

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `GOOGLE_CLOUD_PROJECT` | — | Progetto GCP |
| `ENGINE_ID` / `DATA_STORE_ID` | — | DE identifiers |
| `GCS_BUCKET` (o `BUCKET_*`) | — | Bucket raw/normalized/quarantine |
| `DOCAI_LAYOUT_PROCESSOR_ID` | — | Processor Layout Parser |
| `STORE_TYPE` | `file` | `firestore` · `file` · `memory` |
| `INDEX_DRY_RUN` | `false` | Salta il PUT su DE |
| `SPLIT_PDF_FATAL` | `50000000` | Dimensione massima senza Document AI |

---

## Sviluppo locale (senza Docker)

```bash
# Backend
cd backend
cp .env.example .env        # compilare GOOGLE_CLOUD_PROJECT e ENGINE_ID
npm install
npm run dev                  # nodemon — riavvio su modifiche → http://localhost:3001

# Frontend (terminale separato)
cd frontend
npm install
npm run dev                  # Vite HMR → http://localhost:5173
                             # /api/* → proxy verso localhost:3001
```

**Build di produzione frontend:**
```bash
cd frontend && npm run build
# output in frontend/dist/
```

---

## Deploy su Google Cloud

### Backend → Cloud Run

```bash
ENGINE_ID=your-engine-id \
DATA_STORE_ID=your-datastore-id \
PROJECT=your-project-id \
  ./deploy/backend.sh
```

Costruisce via Cloud Build, pubblica su Artifact Registry, deploya su Cloud Run (`europe-west1`).

Service account richiesto: `moby-prince-backend@PROJECT.iam.gserviceaccount.com`

**Ruoli IAM minimi:**

| Servizio | Ruolo |
|---------|-------|
| Discovery Engine | `roles/discoveryengine.viewer` |
| Cloud Storage | `roles/storage.objectViewer` |
| BigQuery | `roles/bigquery.dataViewer` |
| Firestore | `roles/datastore.user` |
| Vertex AI | `roles/aiplatform.user` |

### Frontend → Cloud Storage / Firebase Hosting

```bash
BACKEND_URL=https://moby-prince-backend-xxxx-ew.a.run.app \
  ./deploy/frontend.sh

# oppure Firebase:
TARGET=firebase BACKEND_URL=https://… ./deploy/frontend.sh
```

### Ingestion → Cloud Run Job

```bash
./deploy/ingestion.sh
# Poi pianificare via Cloud Scheduler o avviare manualmente:
gcloud run jobs execute moby-prince-ingestion \
  --args="scan,gs://my-bucket/moby-prince/"
```

---

## Autenticazione

Il backend usa esclusivamente **Application Default Credentials (ADC)** — nessuna chiave hardcoded.

| Ambiente | Risoluzione credenziali |
|----------|------------------------|
| Locale diretto | `gcloud auth application-default login` |
| docker-compose | Stesso file montato come volume in `~/.config/gcloud` |
| Cloud Run | Workload Identity del service account allegato |

Quando `API_KEY` è impostata, tutti gli endpoint `/api/*` (eccetto `/api/health`) richiedono:
```
Header:       X-API-Key: <key>
Query param:  ?api_key=<key>    (alternativa)
```

---

## Rate limiting

| Gruppo | Endpoint | Limite |
|--------|----------|--------|
| `answerLimiter` | `/api/answer` · `/api/ask` · `/api/agent` | 20 req/min per client |
| `generalLimiter` | Tutti gli altri | 120 req/min per client |

Il client è identificato dalla chiave API (`X-API-Key`) se presente, altrimenti dall'IP. Questo evita che un singolo IP condiviso (load balancer) esaurisca i limiti di tutti gli utenti.

---

## Stack tecnologico

| Layer | Tecnologie |
|-------|-----------|
| **Frontend** | React 18, React Router v6, Vite, Tailwind CSS, react-markdown |
| **Backend** | Node.js 20, Express 4, helmet, express-rate-limit, pino |
| **RAG core** | Vertex AI Search — Discovery Engine v1 (`:answer` + `:search`) |
| **AI generativa** | Gemini 2.0 Flash (`generateContent`), `text-embedding-004` |
| **Evidence layer** | BigQuery REST API v2 (query + streaming insert) |
| **Sessioni** | Firestore REST API v1 (commit + FieldTransform) |
| **Multimedia** | Vision API · Video Intelligence API · Speech-to-Text v2 |
| **NLP** | Cloud Natural Language API (`analyzeEntities`) |
| **Traduzione** | Cloud Translation API v3 |
| **OCR/Layout** | Document AI — Layout Parser |
| **Storage** | Cloud Storage (corpus + thumbnail + session export) |
| **Auth** | Google Application Default Credentials (`google-auth-library`) |
| **Container** | Docker, nginx 1.27 (reverse proxy + SPA fallback) |

---

## Struttura del repository

```
├── backend/
│   ├── routes/          # Express router per ogni area funzionale
│   ├── services/        # Client REST GCP (DE, BQ, Firestore, Gemini, …)
│   ├── repos/           # Query helpers BigQuery (claims, entities, events, contradictions)
│   ├── transformers/    # Normalizzazione risposte DE (answer, search, citations)
│   ├── filters/         # Schema filtri + builder espressioni DE
│   ├── middleware/       # Auth, rate limit, request ID, error handler
│   └── evidence/        # Modelli normalizzazione evidence layer
├── frontend/
│   ├── src/
│   │   ├── pages/       # Chat, Timeline, DossierBuilder, Contradictions, InvestigationPage
│   │   ├── components/  # MessageBubble, CitationPanel, ContradictionPanel, MediaPlayer, …
│   │   ├── hooks/       # useChat, useChatHistory, useFilters
│   │   └── filters/     # Schema filtri lato client
│   └── nginx.conf
├── ingestion/
│   ├── workers/         # ValidatorWorker, DocumentAIWorker, MediaProcessorWorker,
│   │                    # SplitterWorker, EntityExtractionWorker, IndexerWorker, ClaimExtractorWorker
│   ├── services/        # BQ insert, Gemini JSON, Auth
│   ├── state/           # IngestionJob (state machine) + store (Firestore/file/memory)
│   ├── pipeline/        # Orchestratore + retry
│   └── cloudrun/        # Entrypoint + worker chain factory
├── docs/
│   └── bigquery-schema.sql   # DDL completo evidence dataset
├── deploy/              # Script Cloud Run / Cloud Build / Firebase
└── docker-compose.yml
```

---

## Licenza

Uso riservato — Commissione Parlamentare d'Inchiesta · Camera dei Deputati.
