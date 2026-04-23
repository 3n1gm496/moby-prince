# Normalized Layer Provisioning

Generato: 2026-04-23T17:42:45.760Z

- progetto: `project-fae202f2-19be-4d87-8cd`
- location: `EU`

## Buckets

| Role | Bucket | Status | Location | Storage class |
|---|---|---|---|---|
| raw | moby-prince | exists | EU | STANDARD |
| normalized | moby-prince-normalized | exists | EU | STANDARD |
| quarantine | moby-prince-quarantine | exists | EU | STANDARD |

## Document AI

| Check | Value |
|---|---|
| DOCAI_PROCESSOR_ID | n/a |
| DOCAI_LAYOUT_PROCESSOR_ID | n/a |
| DOCAI_FORCE_ALL_PDFS | false |

## Available Processors

```json
[
  {
    "name": "projects/419763035604/locations/eu/processors/450acd5e00e625ba",
    "type": "LAYOUT_PARSER_PROCESSOR",
    "displayName": "moby-prince-layout",
    "state": "ENABLED"
  },
  {
    "name": "projects/419763035604/locations/eu/processors/56ad30ca7ebb15c8",
    "type": "OCR_PROCESSOR",
    "displayName": "moby-prince-ocr",
    "state": "ENABLED"
  }
]
```

## Recommended Env

```bash
BUCKET_RAW=moby-prince
BUCKET_NORMALIZED=moby-prince-normalized
BUCKET_QUARANTINE=moby-prince-quarantine
DOCAI_FORCE_ALL_PDFS=true
```
