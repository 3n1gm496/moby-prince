# Metadata Model — Moby Prince Evidence Platform

## Purpose

This document defines the metadata taxonomy for documents and chunks in the Moby Prince corpus, the Vertex AI Search datastore schema required to enable filtering, and the steps needed to populate and activate each field.

All filter fields are currently `available: false` in `backend/filters/schema.js`. The API accepts them and validates their values but silently drops them from filter expressions until the datastore schema is configured and documents are annotated.

---

## Taxonomy

### `document_type` — Document type

Classifies the nature of the document.

| Value | Italian label | Description |
|-------|---------------|-------------|
| `testimony` | Testimonianza | Witness statement or deposition |
| `report` | Relazione | Official report (investigative, technical, ministerial) |
| `expert_opinion` | Perizia | Court-appointed or independent expert opinion |
| `exhibit` | Allegato | Exhibit attached to trial or parliamentary proceedings |
| `decree` | Decreto | Ministerial or presidential decree |
| `parliamentary_act` | Atto parlamentare | Parliamentary question, interpellation, or resolution |
| `press` | Stampa | Press articles and news clippings |
| `investigation` | Indagine | Criminal or administrative investigation document |

### `institution` — Originating institution

The authority or body that produced the document.

| Value | Italian label |
|-------|---------------|
| `marina_militare` | Marina Militare |
| `guardia_costiera` | Guardia Costiera |
| `procura_livorno` | Procura della Repubblica di Livorno |
| `commissione_parlamentare` | Commissione Parlamentare d'Inchiesta |
| `tribunale` | Tribunale di Livorno / Corte d'Appello |
| `ministero_trasporti` | Ministero dei Trasporti |
| `rina` | RINA (Registro Italiano Navale) |
| `other` | Altro |

### `year` — Document year

Integer year of the document (not the ingest year). Range: 1991–2024.

Key documentary periods:
- **1991**: Immediate post-disaster reports, MRCC communications, initial investigations
- **1993–1997**: First Livorno trial
- **1998–1999**: Appeal proceedings
- **1997–1998**: X Parliamentary Commission (first)
- **2015–2017**: Supplementary investigation, revised timeline of the disaster
- **2021–2022**: Parliamentary Commission of Inquiry (Camera dei Deputati, XVIII legislature)
- **2022–2023**: Final parliamentary report

### `legislature` — Italian legislature

Relevant to parliamentary acts and commission proceedings.

| Value | Period | Relevance |
|-------|--------|-----------|
| `X` | 1987–1992 | Disaster occurs; initial parliamentary questions |
| `XI` | 1992–1994 | First formal parliamentary attention |
| `XII` | 1994–1996 | Ongoing trial phase |
| `XIII` | 1996–2001 | X Parliamentary Commission, first post-trial review |
| `XIV` | 2001–2006 | — |
| `XV` | 2006–2008 | — |
| `XVI` | 2008–2013 | — |
| `XVII` | 2013–2018 | Supplementary investigation period |
| `XVIII` | 2018–2022 | Parliamentary Commission of Inquiry (Camera dei Deputati) |
| `XIX` | 2022– | Final commission report, current legislature |

### `persons_mentioned` — Named persons

Array of full names (or last names) of persons mentioned in the document. Supports exact-match filtering. Not tokenised — queries must match how the name is stored.

Examples: `Carlo Nardelli`, `Ugo Chessa`, `Amedeo Guida`.

### `topic` — Primary topic

The main subject of the document or chunk.

| Value | Label | Description |
|-------|-------|-------------|
| `incendio` | Incendio | Fire dynamics, origin, spread on the Moby Prince |
| `collisione` | Collisione | The collision with the AGIP Abruzzo tanker |
| `soccorso` | Soccorso | Rescue operations, response times, MRCC coordination |
| `responsabilita` | Responsabilità | Criminal and civil liability |
| `indennizzo` | Indennizzo | Compensation, insurance, civil claims |
| `rotta` | Rotta | Navigation, route, vessel positions before collision |
| `comunicazioni` | Comunicazioni | Radio communications, VHF logs, distress signals |
| `radar` | Radar | Radar data, port authority surveillance |
| `nebbia` | Nebbia | Fog, visibility conditions on the night of 10 April 1991 |
| `vittime` | Vittime | Victims, survivors, casualty list |

### `ocr_quality` — OCR quality

Confidence level of the OCR extraction. Affects reliability of chunk text.

| Value | Label | Meaning |
|-------|-------|---------|
| `high` | Alta | Clean scan, high text fidelity |
| `medium` | Media | Minor errors, generally readable |
| `low` | Bassa | Poor scan, significant OCR noise |

---

## Vertex AI Search Datastore Schema

To activate filters, each field must be declared in the datastore's schema as both **indexable** and **filterable**. Below is the schema definition in Vertex AI Search JSON format.

```json
{
  "structSchema": {
    "properties": {
      "document_type": {
        "type": "string",
        "indexable": true,
        "filterable": true,
        "retrievable": true
      },
      "institution": {
        "type": "string",
        "indexable": true,
        "filterable": true,
        "retrievable": true
      },
      "year": {
        "type": "integer",
        "indexable": true,
        "filterable": true,
        "retrievable": true
      },
      "legislature": {
        "type": "string",
        "indexable": true,
        "filterable": true,
        "retrievable": true
      },
      "persons_mentioned": {
        "type": "string",
        "keyPropertyMapping": "description",
        "indexable": true,
        "filterable": true,
        "retrievable": true
      },
      "topic": {
        "type": "string",
        "indexable": true,
        "filterable": true,
        "retrievable": true
      },
      "ocr_quality": {
        "type": "string",
        "indexable": false,
        "filterable": true,
        "retrievable": true
      }
    }
  }
}
```

Apply with the REST API:

```bash
curl -X PATCH \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://discoveryengine.googleapis.com/v1/projects/$PROJECT_ID/locations/$LOCATION/dataStores/$DATA_STORE_ID/schema/default_schema" \
  -d @schema.json
```

---

## Document Metadata Format

Documents are imported into Vertex AI Search as JSONL. Each document line must include a `structData` object containing the metadata fields:

```jsonl
{
  "id": "procura-livorno-1991-rel-001",
  "structData": {
    "title": "Relazione tecnica MRCC Livorno — 10 aprile 1991",
    "document_type": "report",
    "institution": "guardia_costiera",
    "year": 1991,
    "legislature": "X",
    "persons_mentioned": ["Ugo Chessa", "Mario Landi"],
    "topic": "soccorso",
    "ocr_quality": "medium"
  },
  "content": {
    "mimeType": "text/plain",
    "uri": "gs://moby-prince-corpus/reports/mrcc-livorno-1991-rel-001.txt"
  }
}
```

For chunk-based datastores (layout-aware chunking), metadata is attached at the document level and flows down to all derived chunks automatically.

---

## Activation Checklist

To activate a filter field end-to-end:

- [ ] Update `backend/filters/schema.js`: set `available: true` for the field
- [ ] Update `frontend/src/filters/schema.js`: set `available: true` for the field
- [ ] Apply the updated datastore schema (PATCH request above)
- [ ] Re-import or update documents with the metadata field populated in `structData`
- [ ] Trigger a re-index if the datastore does not auto-index on import
- [ ] Verify with a test filter expression via `POST /api/search` with the field active

---

## Filter Expression Syntax Reference

Generated by `backend/filters/schema.js` → `buildFilterExpression()`:

| Field type | Expression format |
|------------|-------------------|
| String/enum | `struct.field_name: "value"` |
| Number (exact) | `struct.field_name = 1991` |
| Multiple values | `struct.field_name: ANY("val1", "val2")` *(not yet implemented — single value only)* |

Multiple active filters are joined with ` AND `.

Example with two active fields:
```
struct.document_type: "testimony" AND struct.year = 1991
```

---

## Notes on `persons_mentioned`

`persons_mentioned` is modelled as a string (exact match) rather than a string array because Vertex AI Search array-of-strings filtering requires the `ANY()` operator and exact normalisation. Until a name-normalisation pipeline is in place (canonicalising names from OCR), text-based exact match is the safest approach.

Future: a NER enrichment step in the Document AI pipeline should extract and normalise person names before ingest.
