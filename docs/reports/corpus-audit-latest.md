# Corpus Audit

Generato: 2026-04-23T16:49:18.763Z

## Counts

| Area | Count |
|---|---:|
| GCS raw | 254 |
| GCS normalized | n/a |
| Discovery Engine documents | 245 |
| BigQuery documents | 245 |
| BigQuery claims | 6506 |
| BigQuery events | 647 |
| BigQuery entities | 133 |
| BigQuery source_anchors | 6506 |
| BigQuery entity_profiles | 133 |
| BigQuery evidence_links | 0 |

## Mismatches

| Check | Value |
|---|---:|
| eventsWithoutRealSources | 0 |
| invalidEventEntityIds | 0 |
| claimsWithoutDocuments | 0 |
| anchorsWithoutDocuments | 0 |
| pageAnchors | 0 |
| nullDateWithItalianDay | 0 |
| documentsWithoutSourceUri | 0 |
| emptyEntityProfiles | 0 |

## Quality

| Check | Value |
|---|---:|
| documents_without_normalized_uri | 245 |
| documents_without_chunk_count | 245 |
| documents_without_ocr_quality | 245 |
| documents_with_split_parent | 0 |
| claims_with_page_reference | 0 |
| claims_without_page_reference | 6506 |

## Samples

```json
{
  "eventsWithoutSources": [],
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
  }
]
```

### fileExtensions

```json
[
  {
    "ext": "pdf",
    "documents": 244
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
    "anchors": 6506
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
