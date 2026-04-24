# Corpus Audit

Generato: 2026-04-24T06:42:24.846Z

## Counts

| Area | Count |
|---|---:|
| GCS raw | 254 |
| GCS normalized | 103 |
| Discovery Engine documents | 245 |
| BigQuery documents | 246 |
| BigQuery claims | 6506 |
| BigQuery events | 647 |
| BigQuery entities | 133 |
| BigQuery source_anchors | 6826 |
| BigQuery entity_profiles | 133 |
| BigQuery evidence_links | 0 |

## Mismatches

| Check | Value |
|---|---:|
| eventsWithoutRealSources | 27 |
| invalidEventEntityIds | 0 |
| claimsWithoutDocuments | 0 |
| anchorsWithoutDocuments | 0 |
| pageAnchors | 160 |
| nullDateWithItalianDay | 0 |
| documentsWithoutSourceUri | 0 |
| emptyEntityProfiles | 0 |

## Quality

| Check | Value |
|---|---:|
| documents_without_normalized_uri | 243 |
| documents_without_chunk_count | 243 |
| documents_without_ocr_quality | 246 |
| documents_with_split_parent | 0 |
| claims_with_page_reference | 160 |
| claims_without_page_reference | 6346 |

## Samples

```json
{
  "eventsWithoutSources": [
    {
      "id": "event-22-20-witness-sees-agip-abruzzo-and-other-ships-5fe02ee5",
      "title": "Witness sees Agip Abruzzo and other ships",
      "date_text": "22:20"
    },
    {
      "id": "event-1991-04-10-operazioni-di-trasbordo-di-armamenti-c29b1d11",
      "title": "Operazioni di trasbordo di armamenti",
      "date_text": "10 aprile 1991"
    },
    {
      "id": "event-1991-04-10-partenza-della-margareth-lykes-523ec5f1",
      "title": "Partenza della Margareth Lykes",
      "date_text": "sera dei fatti (10 aprile 1991)"
    },
    {
      "id": "event-22-14-visibility-described-as-discrete-1bf63b41",
      "title": "Visibility described as discrete",
      "date_text": "22:14"
    },
    {
      "id": "event-1991-04-10-passeggeri-trovati-nella-sala-de-luxe-543559e1",
      "title": "Passeggeri trovati nella sala De Luxe",
      "date_text": "dopo la collisione del 10 aprile 1991"
    },
    {
      "id": "event-04-10-first-tugboat-connects-to-moby-prince-d48bef76",
      "title": "First tugboat connects to Moby Prince",
      "date_text": "04:10"
    },
    {
      "id": "event-1995-03-31-rapporto-questura-di-livorno-digos-ebfc46c5",
      "title": "Rapporto Questura di Livorno – Digos",
      "date_text": "31 marzo 1995"
    },
    {
      "id": "event-2002-05-24-dichiarazione-di-john-t-oliver-sul-ru-f66c684b",
      "title": "Dichiarazione di John T. Oliver sul ruolo delle navi americane",
      "date_text": "24 maggio 2002"
    },
    {
      "id": "event-2002-05-24-risposta-del-capitano-di-vascello-joh-f25716c0",
      "title": "Risposta del Capitano di Vascello John T. Oliver",
      "date_text": "24 maggio 2002"
    },
    {
      "id": "event-ore-20-22-20-moby-prince-communication-with-livo-0d876db6",
      "title": "Moby Prince communication with Livorno Radio",
      "date_text": "Ore 20.22.20"
    }
  ],
  "entities": [
    {
      "id": "organization-associazione-10-aprile-b66c0290",
      "canonical_name": "Associazione 10 Aprile",
      "entity_type": "ORGANIZATION"
    },
    {
      "id": "person-antonio-d-alessio-1312b3d5",
      "canonical_name": "Antonio D'Alessio",
      "entity_type": "PERSON"
    },
    {
      "id": "organization-assitalia-4730f231",
      "canonical_name": "Assitalia",
      "entity_type": "ORGANIZATION"
    },
    {
      "id": "vessel-moby-prince-3e0193b7",
      "canonical_name": "Moby Prince",
      "entity_type": "VESSEL"
    },
    {
      "id": "organization-arma-dei-carabinieri-07108a20",
      "canonical_name": "Arma dei Carabinieri",
      "entity_type": "ORGANIZATION"
    },
    {
      "id": "organization-procura-della-repubblica-e994966d",
      "canonical_name": "Procura della Repubblica",
      "entity_type": "ORGANIZATION"
    },
    {
      "id": "organization-the-standard-steamship-owners-protection-and-ind-b",
      "canonical_name": "The Standard Steamship Owners Protection and Indemnity Association",
      "entity_type": "ORGANIZATION"
    },
    {
      "id": "organization-nav-ar-ma-5666d0aa",
      "canonical_name": "Nav.Ar.Ma.",
      "entity_type": "ORGANIZATION"
    },
    {
      "id": "person-gianmarco-macchia-6b803233",
      "canonical_name": "Gianmarco Macchia",
      "entity_type": "PERSON"
    },
    {
      "id": "person-leonardo-chiesa-71494e1e",
      "canonical_name": "Leonardo Chiesa",
      "entity_type": "PERSON"
    }
  ]
}
```

## Distributions

### documentTypes

```json
[
  {
    "document_type": "testimony",
    "documents": 222
  },
  {
    "document_type": "report",
    "documents": 9
  },
  {
    "document_type": "parliamentary_act",
    "documents": 6
  },
  {
    "document_type": "document",
    "documents": 4
  },
  {
    "document_type": "judicial_act",
    "documents": 4
  },
  {
    "document_type": null,
    "documents": 1
  }
]
```

### fileExtensions

```json
[
  {
    "ext": "pdf",
    "documents": 245
  },
  {
    "ext": "txt",
    "documents": 1
  }
]
```

### claimExtractionMethods

```json
[
  {
    "extraction_method": "llm_extracted",
    "claims": 6506
  }
]
```

### anchorTypes

```json
[
  {
    "anchor_type": "text_span",
    "anchors": 6666
  },
  {
    "anchor_type": "page",
    "anchors": 160
  }
]
```

### entityTypes

```json
[
  {
    "entity_type": "PERSON",
    "entities": 86
  },
  {
    "entity_type": "ORGANIZATION",
    "entities": 39
  },
  {
    "entity_type": "VESSEL",
    "entities": 5
  },
  {
    "entity_type": "LOCATION",
    "entities": 3
  }
]
```

### eventDatePrecision

```json
[
  {
    "date_precision": "day",
    "events": 457
  },
  {
    "date_precision": "year",
    "events": 78
  },
  {
    "date_precision": "inferred",
    "events": 60
  },
  {
    "date_precision": "month",
    "events": 31
  },
  {
    "date_precision": "approximate",
    "events": 21
  }
]
```
