# Evidence Model

Questo documento descrive il modello dati operativo usato dal prodotto.

Il riferimento implementativo lato backend è [backend/evidence/models.js](../backend/evidence/models.js).

## Tabelle principali

### `documents`

Una riga per documento ingestato.

Campi essenziali:

- `id`
- `title`
- `source_uri`
- `normalized_uri`
- `document_type`
- `institution`
- `year`
- `ocr_quality`
- `created_at`
- `updated_at`

### `chunks`

Porzioni testuali indicizzabili o riconducibili al documento.

Campi essenziali:

- `id`
- `document_id`
- `content`
- `page_start`
- `page_end`
- `chunk_index`

### `entities`

Registry canonica di persone, navi, enti e luoghi.

Campi essenziali:

- `id`
- `entity_type`
- `canonical_name`
- `aliases`
- `description`
- `role`

Tipi canonici:

- `PERSON`
- `ORGANIZATION`
- `VESSEL`
- `LOCATION`

### `events`

Eventi cronologici unificati.

Campi essenziali:

- `id`
- `title`
- `description`
- `event_type`
- `occurred_at`
- `date_text`
- `date_precision`
- `entity_ids`
- `source_claim_ids`

`date_precision` supporta:

- `exact`
- `day`
- `month`
- `year`
- `approximate`
- `inferred`

### `claims`

Unità atomica del layer strutturato.

Campi essenziali:

- `id`
- `text`
- `claim_type`
- `document_id`
- `document_uri`
- `chunk_id`
- `page_reference`
- `entity_ids`
- `event_id`
- `confidence`
- `status`
- `extraction_method`

`status` operativo:

- `unverified`
- `corroborated`
- `challenged`
- `retracted`

### `source_anchors`

Layer dedicato alla provenance precisa.

Campi essenziali:

- `id`
- `document_id`
- `claim_id`
- `event_id`
- `anchor_type`
- `page_number`
- `text_quote`
- `snippet`
- `time_start_seconds`
- `time_end_seconds`
- `frame_reference`
- `shot_reference`
- `anchor_confidence`
- `source_uri`
- `mime_type`

Tipi di anchor:

- `page`
- `text_span`
- `timestamp`
- `frame`
- `shot`

### `entity_profiles`

Summary AI materializzate per le pagine entità.

Campi essenziali:

- `entity_id`
- `summary`
- `aliases`
- `role`
- `summary_version`
- `source_claim_ids`
- `generated_at`
- `updated_at`

### `evidence_links`

Join opzionale fra claim e chunk/documenti per verifiche e drill-down.

Campi essenziali:

- `id`
- `claim_id`
- `chunk_id`
- `document_id`
- `link_type`
- `strength`
- `note`

`link_type` supportato:

- `supports`
- `refutes`
- `mentions`
- `references`
- `qualifies`

## Contratti applicativi

### Source

Il frontend non lavora direttamente sulle righe grezze di BigQuery.

Una `source` esposta dal backend contiene:

```json
{
  "id": "source-id",
  "claimId": "claim-id",
  "documentId": "document-id",
  "title": "Titolo",
  "uri": "gs://bucket/path/file.pdf",
  "snippet": "estratto",
  "pageReference": "p. 47",
  "mimeType": "application/pdf",
  "documentType": "report",
  "year": 1991,
  "anchors": []
}
```

### Event

Un evento esposto alla UI contiene almeno:

```json
{
  "id": "event-id",
  "title": "Titolo",
  "description": "Sintesi",
  "eventType": "judicial",
  "dateLabel": "10 aprile 1991",
  "dateAccuracy": "exact",
  "sources": []
}
```

## Regole operative

1. Quando esistono `anchors[]`, il frontend usa quelli come sorgente di verità.
2. `pageReference` resta utile come fallback e come etichetta legacy.
3. I profili entità non dovrebbero dipendere da generazione live a richiesta.
4. La timeline deve usare eventi già unificati, non claim grezzi.
5. Quando fonti diverse raccontano versioni diverse, il sistema deve attribuirle correttamente alle fonti, non creare feature automatiche di “conflitto”.
