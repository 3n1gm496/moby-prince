# Ingestion Architecture — Moby Prince Evidence Platform

## Motivation

The current corpus has been loaded directly into Vertex AI Search with mixed results. Known failure modes observed in production:

| Symptom | Root cause | Frequency |
|---------|-----------|-----------|
| `FILE_READ_ERROR` in Discovery Engine | Corrupted or poorly-scanned PDFs that the parser cannot read | Moderate |
| Oversized text segmentation failures | Text documents exceeding the 2.5 MB per-document limit, generating too many chunks | Rare but impactful |
| Missing or incomplete metadata | Documents imported without `structData`, making metadata filtering impossible | Universal (current state) |
| Silent partial ingest | Large batch imports where some documents succeed and others fail with no per-document error surfaced | Occasional |

The ingestion architecture described here addresses all of these by adding per-document state tracking, a quarantine channel for unrecoverable failures, automatic splitting for oversized files, and a repair workflow for documents that need operator intervention.

---

## GCS Bucket Layout

Three buckets, one per lifecycle stage:

```
gs://{project}-corpus-raw/               # original files as-uploaded — immutable
    moby-prince/
        proceedings/
        testimonies/
        reports/

gs://{project}-corpus-normalized/        # extracted text + split parts — pipeline output
    moby-prince/
        {original-path}/{filename}.txt                  single-part extraction
        {original-path}/{filename}_part_001.txt         split parts (if oversized)
        {original-path}/{filename}_part_002.txt

gs://{project}-corpus-quarantine/        # files that could not be indexed after max retries
    moby-prince/
        {original-path}/{filename}                      original file (copied)
        {original-path}/{filename}.failure.json         failure metadata sidecar
```

**Naming convention:** file names in `normalized/` and `quarantine/` mirror the path in `raw/` so provenance is always traceable.

**Access control:**
- `raw/`: Cloud Run SA has `storage.objectViewer`; humans have `storage.objectCreator` via IAP
- `normalized/`: Cloud Run pipeline SA has `storage.objectAdmin`
- `quarantine/`: ops team `storage.objectViewer`; alerts on new writes

---

## Pipeline Architecture

```
          ┌─────────────────────────────────────────────┐
          │           Cloud Run Job (pipeline)           │
          │                                              │
raw/file  │  ValidatorWorker → SplitterWorker → IndexerWorker │
──────────┤                                              ├──► Discovery Engine
          │  per-document state tracked in Firestore     │
          │  or local FileStore (dev)                    │
          └─────────────────────────────────────────────┘
                    │failures                 │quarantine
                    ▼                         ▼
               retry scheduler          quarantine bucket
               (Cloud Scheduler)        + .failure.json sidecar
```

### Worker chain

| Worker | Input state | Output state | Halts on | Side effects |
|--------|-------------|--------------|----------|--------------|
| `ValidatorWorker` | PENDING | VALIDATING | FILE_NOT_FOUND, PDF_CRITICAL, VALIDATION_FAILURE | enriches job with fileSizeBytes, mimeType |
| `SplitterWorker` | VALIDATING (if oversized) | SPLITTING | SPLIT_FAILURE, PDF_CRITICAL | writes split parts to normalized/; creates child jobs |
| `IndexerWorker` | VALIDATING or SPLITTING | INDEXING → INDEXED | INDEX_FAILURE | imports document or part into Discovery Engine |

Workers are stateless pure functions: they receive an `IngestionJob`, return a `WorkerResult { job, halt, outputs }`, and never mutate the input.

---

## State Machine

Every document has exactly one `IngestionJob` with a status that follows this state machine:

```
PENDING ──[validate]──► VALIDATING ──[pass]──► (SPLITTING if oversized) ──► INDEXING ──► INDEXED
                              │                          │                        │
                           [fail]                    [fail]                    [fail]
                              └─────────────────────────┴────────────────────► FAILED
                                                                                   │
                                                              [maxAttempts exceeded]
                                                              [non-retryable code]
                                                                                   │
                                                                             QUARANTINED
```

**Terminal states:** `INDEXED` and `QUARANTINED`. Neither will be retried automatically.

**Non-retryable error codes** (quarantine immediately, never enter FAILED):
- `PDF_CRITICAL` — PDF > 50 MB; requires Document AI, cannot be directly ingested
- `PARSE_FAILURE` — text extraction completely failed; file is unreadable
- `VALIDATION_FAILURE` — unsupported type, empty file, or other fundamental issue

**Retryable error codes** (enter FAILED, eligible for retry up to `maxAttempts`):
- `FILE_READ_ERROR` — transient Discovery Engine parse failure (often resolves on retry)
- `INDEX_FAILURE` — Discovery Engine import API error
- `FILE_NOT_FOUND` — transient GCS object unavailability
- `PDF_LARGE` — PDF over warn threshold; retry may succeed with a different DE configuration

### Job data model

```javascript
{
  jobId:            string,       // UUID
  sourceUri:        string,       // gs://raw-bucket/path/file.pdf  or  /local/path
  normalizedUri:    string|null,  // gs://normalized-bucket/path/file.txt
  documentId:       string|null,  // Discovery Engine document ID (set on INDEXED)

  status:           'PENDING' | 'VALIDATING' | 'SPLITTING' | 'INDEXING' | 'INDEXED' | 'FAILED' | 'QUARANTINED',
  errorCode:        string|null,
  errorMessage:     string|null,

  attempts:         number,       // incremented on each reschedule
  maxAttempts:      number,       // default 3 (configurable per job)
  lastAttemptAt:    string|null,  // ISO timestamp of last attempt start

  isSplit:          boolean,      // true if the document was split into parts
  splitParts:       string[],     // URIs of split parts
  parentJobId:      string|null,  // if this job is a split part

  originalFilename: string,
  mimeType:         string,
  fileSizeBytes:    number|null,
  chunkCount:       number|null,

  createdAt:        string,
  updatedAt:        string,
  completedAt:      string|null,
}
```

---

## Splitting Strategy

### Why files get rejected

Vertex AI Search (unstructured datastore, EU) enforces:
- Max document body: **2.5 MB** per document
- Layout-aware chunking: fails with `FILE_READ_ERROR` for some PDFs (common above 10 MB; near-certain above 50 MB)
- Chunk count: informally ~500 chunks per document; over-chunked documents cause silent partial ingest

### Text splitting algorithm

`workers/splitter.js` → `splitTextIntoParts(text, opts)`:

1. Split on paragraph boundaries (two or more consecutive newlines)
2. Accumulate paragraphs until the next one would push the part over `maxCharsPerPart` (default 800k chars ≈ 200k tokens)
3. If a single paragraph is itself over the limit, split at sentence boundaries (`.!?` followed by whitespace)
4. If a single sentence is over the limit, hard-split at `maxCharsPerPart` characters

Each part is written as `{stem}_part_001.txt … _part_NNN.txt`. Parts maintain document order; there is no inter-part overlap by default (overlap is configurable for future use with a retrieval model that benefits from context continuity).

### PDF splitting

PDFs cannot be split at the text level without extraction. The correct path is:

1. Document AI layout OCR → structured page-level text blocks
2. Reconstruct text per logical section (heading → content block)
3. Write each section as a separate `.txt` file with metadata (`pageStart`, `pageEnd`, `section`)
4. Ingest section files as separate documents

Until Document AI is integrated, PDFs over 10 MB are flagged with `PDF_LARGE` (warn, retryable), and PDFs over 50 MB are quarantined immediately (`PDF_CRITICAL`, non-retryable).

---

## Retry and Quarantine

### Retry scheduler

`pipeline/retry.js` → `retryFailed(store, config)`:

1. Query all `FAILED` jobs from the store
2. For each job:
   - If `attempts >= maxAttempts` → quarantine (no further retry)
   - Otherwise → `job.reschedule()` → wait `backoff(attempts)` ms → run pipeline again
3. Exponential backoff: `min(initialDelay × 2^attempts, maxDelay)`, default 2s → 4s → 8s → … → 60s max

**Production deployment:** Cloud Scheduler triggers the retry Cloud Run Job every 15 minutes. Idempotent: a job with no FAILED entries exits immediately.

### Quarantine workflow

When a job reaches `QUARANTINED`:

1. `QuarantineManager.export(job)` copies the original file to `quarantine/` and writes a `.failure.json` sidecar
2. Cloud Monitoring alert fires (metric: `custom/ingestion/quarantine_count`)
3. Operator reviews the `.failure.json` sidecar, repairs the file, and calls `requeue(job, store)` to reset to PENDING

```bash
# List quarantined jobs
node ingestion/cli/run.js quarantine

# After fixing the file, requeue for retry
node ingestion/cli/run.js requeue <jobId>
```

---

## Document AI Integration Path

For PDFs that exceed the direct ingest size limit, the production path is:

```
raw/ PDF ──► Document AI (layout OCR) ──► normalized/ page-section .txt files ──► Discovery Engine import
```

Document AI processor to use: **Document OCR** (`DOCUMENT_OCR`) for general PDFs, **Form Parser** if documents contain structured tables.

Output enrichment from Document AI:
- Per-page text blocks with bounding boxes
- Section headings (used to create logical split boundaries)
- Detected form fields (for exhibits with structured data)
- Confidence scores per page (feeds `ocr_quality` metadata field)

Once Document AI is integrated, `ValidatorWorker` routes PDFs over `pdfCriticalBytes` to a `DocumentAIWorker` instead of quarantine.

**Document AI worker (not yet implemented):**
```javascript
// workers/documentai.js (planned)
class DocumentAIWorker extends BaseWorker {
  async run(job, context) {
    // 1. Submit PDF to Document AI processBatch API
    // 2. Wait for operation (poll or Pub/Sub notification)
    // 3. Download JSON result from GCS output bucket
    // 4. Extract page text blocks, reconstruct logical sections
    // 5. Write section .txt files to normalized/ bucket
    // 6. Create child jobs for each section
    // 7. Return updated job with isSplit=true, splitParts=[...]
  }
}
```

---

## Cloud Run Job Deployment

The pipeline runs as a **Cloud Run Job**, not a Cloud Run Service. Cloud Run Jobs are:
- Batch-oriented (run to completion)
- Billed per CPU-second (no idle cost)
- Triggered by Cloud Scheduler, Eventarc, or manual execution

### Dockerfile (planned)

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY ingestion/ ./ingestion/
COPY backend/services/auth.js ./backend/services/auth.js
COPY backend/config.js ./backend/config.js
RUN cd ingestion && npm install --production
ENTRYPOINT ["node", "ingestion/cli/run.js"]
CMD ["retry"]
```

### Cloud Scheduler triggers

| Schedule | Command | Purpose |
|----------|---------|---------|
| Every 15 min | `retry` | Retry FAILED jobs |
| Daily 02:00 | `scan gs://corpus-raw` | Detect newly uploaded files with issues |
| On GCS event (Eventarc) | `ingest <uri>` | Process new uploads immediately |

### Eventarc trigger (GCS → Cloud Run Job)

```bash
gcloud eventarc triggers create ingest-trigger \
  --event-filters="type=google.cloud.storage.object.v1.finalized" \
  --event-filters="bucket=${PROJECT_ID}-corpus-raw" \
  --destination-run-job="moby-ingest-pipeline" \
  --destination-run-region="europe-west1" \
  --service-account="ingest-sa@${PROJECT_ID}.iam.gserviceaccount.com"
```

---

## State Store: Local vs Production

| Environment | Store | Location |
|------------|-------|---------|
| Local dev | `FileStore` (JSON files per job) | `./corpus/.state/*.json` |
| Staging | `FirestoreStore` | `projects/{p}/databases/(default)/documents/ingestion_jobs` |
| Production | `FirestoreStore` + BQ audit log | Firestore for live state; BQ for history |

`FirestoreStore` is documented as a skeleton in `ingestion/state/store.js`. To activate it:

```javascript
const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore({ projectId: config.projectId });
// Swap createStore() to return new FirestoreStore(db)
```

BigQuery audit log (planned): append every state transition to a `ingestion_events` table for permanent audit trail, even after Firestore documents are deleted.

---

## Observability

### Structured logs

All components use `createLogger()` from `workers/base.js`, which emits newline-delimited JSON to stdout/stderr. Cloud Run automatically ingests these into Cloud Logging.

Log entry shape:
```json
{
  "severity": "INFO",
  "component": "splitter",
  "message": "Split into 6 parts",
  "timestamp": "2024-04-10T09:30:00.000Z",
  "jobId": "9adaa8dd-...",
  "partsCount": 6,
  "partUris": ["gs://..."]
}
```

### Recommended Cloud Monitoring metrics

| Metric | Alert threshold | Meaning |
|--------|----------------|---------|
| `custom/ingestion/jobs_failed` | > 5 in 1 hour | Systematic ingestion failure |
| `custom/ingestion/quarantine_count` | Any increase | Documents requiring operator attention |
| `custom/ingestion/pipeline_duration_p95` | > 300s | Abnormally slow processing |
| `logging/log_entry_count` severity=ERROR | > 10 in 15 min | Worker errors |

Metric emission is not yet wired; add calls to `monitoring.createTimeSeries()` in `workers/base.js` `createLogger()` at the error/warn level.

### Cloud Logging queries

```
# All QUARANTINED events
resource.type="cloud_run_job"
jsonPayload.status="QUARANTINED"

# FILE_READ_ERROR occurrences
jsonPayload.errorCode="FILE_READ_ERROR"

# Splitter output (all splits)
jsonPayload.component="splitter"
jsonPayload.partsCount>0
```

---

## Local Development Quickstart

```bash
# Scan a directory for files that will fail ingestion
node ingestion/cli/run.js scan ./my-corpus/

# Analyse a single file
node ingestion/cli/run.js analyze ./my-corpus/report.pdf

# Split an oversized text file (no GCP needed)
node ingestion/cli/run.js split ./my-corpus/large-testimony.txt ./output/

# Run full pipeline in dry-run mode (no actual Discovery Engine import)
INDEX_DRY_RUN=true node ingestion/cli/run.js ingest ./my-corpus/testimony.txt

# Run against real Discovery Engine (requires .env or env vars)
DATA_STORE_ID=your-datastore-id \
GOOGLE_CLOUD_PROJECT=your-project \
node ingestion/cli/run.js ingest ./my-corpus/testimony.txt

# Show job states
node ingestion/cli/run.js status

# Retry failed jobs
node ingestion/cli/run.js retry

# List quarantined jobs and requeue after manual repair
node ingestion/cli/run.js quarantine
node ingestion/cli/run.js requeue <jobId>
```

---

## What Must Change to Go to Production

| Item | File | Action |
|------|------|--------|
| Swap FileStore for FirestoreStore | `ingestion/state/store.js` | Uncomment `FirestoreStore`, wire in `createStore()` |
| Wire GCS StorageProvider | `ingestion/config.js` + workers | Pass `new Storage()` as `context.storage` |
| Add Document AI worker | `ingestion/workers/documentai.js` | Implement class, insert before IndexerWorker for PDFs |
| Add Cloud Monitoring metric emission | `ingestion/workers/base.js` | Call `monitoring.createTimeSeries()` on state transitions |
| Add BQ audit log | `ingestion/state/store.js` | Append every `store.save()` transition to BQ `ingestion_events` |
| Dockerfile + Cloud Run Job | `ingestion/Dockerfile` | Build image, push to Artifact Registry, deploy as Cloud Run Job |
| Eventarc trigger | gcloud CLI | Connect GCS `raw/` finalize events to Cloud Run Job |
| Cloud Scheduler | gcloud CLI | Schedule `retry` job every 15 minutes |
| IAM roles | Terraform | `storage.objectAdmin` on normalized/quarantine buckets; `discoveryengine.editor` |
