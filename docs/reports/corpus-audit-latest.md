# Corpus Audit

Generato: 2026-04-24T07:07:15.038Z

## Counts

| Area | Count |
|---|---:|
| GCS raw | 254 |
| GCS normalized | 121 |
| Discovery Engine documents | 245 |
| BigQuery documents | 246 |
| BigQuery claims | 6522 |
| BigQuery events | 647 |
| BigQuery entities | 133 |
| BigQuery source_anchors | 6910 |
| BigQuery entity_profiles | 133 |
| BigQuery evidence_links | 0 |

## Mismatches

| Check | Value |
|---|---:|
| eventsWithoutRealSources | 33 |
| invalidEventEntityIds | 0 |
| claimsWithoutDocuments | 0 |
| anchorsWithoutDocuments | 0 |
| anchorsWithoutClaims | 186 |
| duplicateDocumentSourceUris | 1 |
| pageAnchors | 202 |
| nullDateWithItalianDay | 0 |
| documentsWithoutSourceUri | 0 |
| emptyEntityProfiles | 0 |

## Quality

| Check | Value |
|---|---:|
| documents_without_normalized_uri | 240 |
| documents_without_chunk_count | 240 |
| documents_without_ocr_quality | 246 |
| documents_with_split_parent | 0 |
| documents_with_normalized_uri | 6 |
| claims_with_page_reference | 202 |
| claims_without_page_reference | 6320 |

## Samples

```json
{
  "eventsWithoutSources": [
    {
      "id": "event-23-45-33-moby-prince-on-fire-18d5134c",
      "title": "Moby Prince on fire",
      "date_text": "23.45.33"
    },
    {
      "id": "event-ore-20-23-20-ipl-communication-with-moby-prince-1dc9f639",
      "title": "IPL communication with Moby Prince",
      "date_text": "Ore 20.23.20"
    },
    {
      "id": "event-1991-04-10-oscuramento-della-petroliera-agip-abr-3fae7556",
      "title": "Oscuramento della petroliera Agip Abruzzo",
      "date_text": "prima della collisione del 10 aprile 1991"
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
      "id": "event-1991-03-19-richiesta-acquisizione-atti-ministeri-69e7dcd8",
      "title": "Richiesta acquisizione atti ministeriali",
      "date_text": "19 marzo 1991"
    },
    {
      "id": "event-2015-07-22-istituzione-commissione-parlamentare--144f709b",
      "title": "Istituzione Commissione Parlamentare d'Inchiesta Moby Prince",
      "date_text": "22 luglio 2015"
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
      "id": "event-04-10-first-tugboat-connects-to-moby-prince-d48bef76",
      "title": "First tugboat connects to Moby Prince",
      "date_text": "04:10"
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
    "claims": 6522
  }
]
```

### anchorTypes

```json
[
  {
    "anchor_type": "text_span",
    "anchors": 6708
  },
  {
    "anchor_type": "page",
    "anchors": 202
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
