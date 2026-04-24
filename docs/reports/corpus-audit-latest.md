# Corpus Audit

Generato: 2026-04-24T09:01:07.258Z

## Counts

| Area | Count |
|---|---:|
| GCS raw | 254 |
| GCS normalized | 363 |
| Discovery Engine documents | 245 |
| BigQuery documents | 246 |
| BigQuery claims | 6888 |
| BigQuery events | 647 |
| BigQuery entities | 133 |
| BigQuery source_anchors | 7896 |
| BigQuery entity_profiles | 133 |
| BigQuery evidence_links | 0 |

## Mismatches

| Check | Value |
|---|---:|
| eventsWithoutRealSources | 70 |
| invalidEventEntityIds | 0 |
| claimsWithoutDocuments | 0 |
| anchorsWithoutDocuments | 0 |
| anchorsWithoutClaims | 313 |
| duplicateDocumentSourceUris | 1 |
| pageAnchors | 695 |
| nullDateWithItalianDay | 0 |
| documentsWithoutSourceUri | 0 |
| emptyEntityProfiles | 0 |

## Quality

| Check | Value |
|---|---:|
| documents_without_normalized_uri | 210 |
| documents_without_chunk_count | 210 |
| documents_without_ocr_quality | 246 |
| documents_with_split_parent | 0 |
| documents_with_normalized_uri | 36 |
| claims_with_page_reference | 695 |
| claims_without_page_reference | 6193 |

## Samples

```json
{
  "eventsWithoutSources": [
    {
      "id": "event-2016-03-15-14-seduta-della-commissione-parlament-62390d41",
      "title": "14ª Seduta della Commissione Parlamentare d’Inchiesta",
      "date_text": "martedì 15 marzo 2016"
    },
    {
      "id": "event-22-14-visibility-described-as-discrete-1bf63b41",
      "title": "Visibility described as discrete",
      "date_text": "22:14"
    },
    {
      "id": "event-1991-04-10-dichiarazione-di-marcella-bini-6331a2b8",
      "title": "Dichiarazione di Marcella Bini",
      "date_text": "intorno alle 22:25 del 10 aprile 1991"
    },
    {
      "id": "event-2016-05-17-23-seduta-commissione-parlamentare-d--ea82d9fd",
      "title": "23ª Seduta Commissione Parlamentare d’Inchiesta Moby Prince",
      "date_text": "martedì 17 maggio 2016"
    },
    {
      "id": "event-2016-05-25-24-seduta-della-commissione-parlament-fcb829dc",
      "title": "24ª seduta della Commissione Parlamentare d’Inchiesta",
      "date_text": "mercoledì 25 maggio 2016"
    },
    {
      "id": "event-2017-05-18-approvazione-e-comunicazione-della-re-7cae70f7",
      "title": "Approvazione e comunicazione della relazione della Commissione",
      "date_text": "18 maggio 2017"
    },
    {
      "id": "event-2016-04-19-seduta-della-commissione-d-inchiesta--0c2937e0",
      "title": "Seduta della Commissione d'inchiesta Moby Prince",
      "date_text": "19 aprile 2016"
    },
    {
      "id": "event-1991-04-10-savelli-giancarlo-and-losoni-paolo-mo-eadf0960",
      "title": "Savelli Giancarlo and Losoni Paolo monitoring VHF channel 16",
      "date_text": "10/04/1991"
    },
    {
      "id": "event-1991-04-10-passeggeri-trovati-nella-sala-de-luxe-543559e1",
      "title": "Passeggeri trovati nella sala De Luxe",
      "date_text": "dopo la collisione del 10 aprile 1991"
    },
    {
      "id": "event-2016-03-22-data-del-disastro-9c89d1cd",
      "title": "Data del disastro",
      "date_text": "martedì 22 marzo 2016"
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
    "claims": 6888
  }
]
```

### anchorTypes

```json
[
  {
    "anchor_type": "text_span",
    "anchors": 7201
  },
  {
    "anchor_type": "page",
    "anchors": 695
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
