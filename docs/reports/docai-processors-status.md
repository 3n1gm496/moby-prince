# Document AI Processor Provisioning

Generato: 2026-04-23T17:06:18.824Z

- progetto: `project-fae202f2-19be-4d87-8cd`
- location: `eu`

## Actions

```json
[
  {
    "action": "created",
    "type": "OCR_PROCESSOR",
    "processor": {
      "name": "projects/419763035604/locations/eu/processors/56ad30ca7ebb15c8",
      "type": "OCR_PROCESSOR",
      "displayName": "moby-prince-ocr",
      "state": "ENABLED"
    }
  },
  {
    "action": "created",
    "type": "LAYOUT_PARSER_PROCESSOR",
    "processor": {
      "name": "projects/419763035604/locations/eu/processors/450acd5e00e625ba",
      "type": "LAYOUT_PARSER_PROCESSOR",
      "displayName": "moby-prince-layout",
      "state": "ENABLED"
    }
  }
]
```

## Processors

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
DOCAI_LOCATION=eu
DOCAI_PROCESSOR_ID=56ad30ca7ebb15c8
DOCAI_LAYOUT_PROCESSOR_ID=450acd5e00e625ba
```
