# Corpus Audit

Generato: 2026-04-24T08:31:06.594Z

## Counts

| Area | Count |
|---|---:|
| GCS raw | 254 |
| GCS normalized | 288 |
| Discovery Engine documents | 245 |
| BigQuery documents | 246 |
| BigQuery claims | 6887 |
| BigQuery events | 647 |
| BigQuery entities | 133 |
| BigQuery source_anchors | 7716 |
| BigQuery entity_profiles | 133 |
| BigQuery evidence_links | 0 |

## Mismatches

| Check | Value |
|---|---:|
| eventsWithoutRealSources | 50 |
| invalidEventEntityIds | 0 |
| claimsWithoutDocuments | 0 |
| anchorsWithoutDocuments | 0 |
| anchorsWithoutClaims | 224 |
| duplicateDocumentSourceUris | 1 |
| pageAnchors | 605 |
| nullDateWithItalianDay | 0 |
| documentsWithoutSourceUri | 0 |
| emptyEntityProfiles | 0 |

## Quality

| Check | Value |
|---|---:|
| documents_without_normalized_uri | 230 |
| documents_without_chunk_count | 230 |
| documents_without_ocr_quality | 246 |
| documents_with_split_parent | 0 |
| documents_with_normalized_uri | 16 |
| claims_with_page_reference | 605 |
| claims_without_page_reference | 6282 |

## Samples

```json
{
  "eventsWithoutSources": [
    {
      "id": "event-2016-02-16-audizione-del-dottor-piero-mannironi--6cd4e247",
      "title": "Audizione del dottor Piero Mannironi e del dottor Alberto Testa",
      "date_text": "16 febbraio 2016"
    },
    {
      "id": "event-23-45-33-moby-prince-on-fire-18d5134c",
      "title": "Moby Prince on fire",
      "date_text": "23.45.33"
    },
    {
      "id": "event-22-20-witness-sees-agip-abruzzo-and-other-ships-5fe02ee5",
      "title": "Witness sees Agip Abruzzo and other ships",
      "date_text": "22:20"
    },
    {
      "id": "event-1998-10-31-tribunale-penale-di-livorno-sentence--b29b5eba",
      "title": "Tribunale Penale di Livorno sentence pronounced",
      "date_text": "31.10.1998"
    },
    {
      "id": "event-1991-04-10-operazioni-di-trasbordo-di-armamenti-c29b1d11",
      "title": "Operazioni di trasbordo di armamenti",
      "date_text": "10 aprile 1991"
    },
    {
      "id": "event-04-10-first-tugboat-connects-to-moby-prince-d48bef76",
      "title": "First tugboat connects to Moby Prince",
      "date_text": "04:10"
    },
    {
      "id": "event-2007-12-24-legge-finanziaria-2007-769af21b",
      "title": "Legge finanziaria 2007",
      "date_text": "24 dicembre 2007"
    },
    {
      "id": "event-1999-01-01-critica-alla-gestione-delle-emergenze-f1cc5526",
      "title": "Critica alla gestione delle emergenze",
      "date_text": "1999"
    },
    {
      "id": "event-2016-02-09-audizione-legale-di-parte-civile-9bd5f19b",
      "title": "Audizione legale di parte civile",
      "date_text": "9 febbraio 2016"
    },
    {
      "id": "event-2016-02-02-6-seduta-della-commissione-parlamenta-c44bdb96",
      "title": "6ª seduta della Commissione Parlamentare d'Inchiesta",
      "date_text": "martedì 2 febbraio 2016"
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
  ],
  "duplicateDocumentSourceUris": [
    {
      "source_uri": "gs://moby-prince/Fonti Giudiziarie/Archiviazione-2010.pdf",
      "row_count": 2,
      "document_ids": [
        "01b1b75b253a3cd8351cc962c253ba44",
        "archiviazione-2010-2380025c"
      ]
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
    "claims": 6887
  }
]
```

### anchorTypes

```json
[
  {
    "anchor_type": "text_span",
    "anchors": 7111
  },
  {
    "anchor_type": "page",
    "anchors": 605
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
