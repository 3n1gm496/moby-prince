# PDF Reprocessing Plan

Generato: 2026-04-23T17:02:08.990Z

- inventoryGeneratedAt: `2026-04-23T16:54:47.996Z`
- bucket: `moby-prince`
- corpusPdfDocuments: `244`
- corpusTxtDocuments: `1`
- supportingObjects: `8`
- legacyObjects: `1`

## Recommended Env

```bash
BUCKET_RAW=moby-prince
BUCKET_NORMALIZED=moby-prince-normalized
BUCKET_QUARANTINE=moby-prince-quarantine
DOCAI_FORCE_ALL_PDFS=true
DOCAI_PROCESSOR_ID=
DOCAI_LAYOUT_PROCESSOR_ID=
```

## Recommended Command

```bash
DOCAI_FORCE_ALL_PDFS=true BUCKET_RAW=moby-prince BUCKET_NORMALIZED=moby-prince-normalized BUCKET_QUARANTINE=moby-prince-quarantine node ingestion/cloudrun/entrypoint.js scan gs://moby-prince/
```

## First Documents

```json
[
  {
    "uri": "gs://moby-prince/Fonti Giudiziarie/Archiviazione-2010.pdf",
    "title": "Archiviazione 2010",
    "documentId": "01b1b75b253a3cd8351cc962c253ba44"
  },
  {
    "uri": "gs://moby-prince/Fonti Giudiziarie/Moby Prince - Istanza Riapertura - 11-10-2006.pdf",
    "title": "Moby Prince Istanza Riapertura 11 10 2006",
    "documentId": "e4083994014c2f67e0e02937c8b5cb81"
  },
  {
    "uri": "gs://moby-prince/Fonti Giudiziarie/Moby-Prince-Sentenza-1_(31.10.1998).pdf",
    "title": "Moby Prince Sentenza 1 (31.10.1998)",
    "documentId": "2fb11784e62779c325737ec95528816c"
  },
  {
    "uri": "gs://moby-prince/Fonti Giudiziarie/Sentenza-Appello-Firenze-1999.pdf",
    "title": "Sentenza Appello Firenze 1999",
    "documentId": "e3a28ed75e77c700716e8901b64a631c"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/delibera_istitutiva.pdf",
    "title": "delibera istitutiva",
    "documentId": "374074a0150a71499f2f598780b646b2"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Regolamento_definitivo.pdf",
    "title": "Regolamento definitivo",
    "documentId": "fa0ac4811b0fccd27582228075c1734c"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Relazioni/Fonti Parlamentari - Commissione Inchiesta 17^ leg - Relazione 22-bis-n6_330368.pdf",
    "title": "Fonti Parlamentari Commissione Inchiesta 17^ leg Relazione 22 bis n6 330368",
    "documentId": "e4ff306b6c29152a1c07d9ec489a556e"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Relazioni/Fonti Parlamentari - Commissione Inchiesta 17^ leg - Relazione finale.pdf",
    "title": "Fonti Parlamentari Commissione Inchiesta 17^ leg Relazione finale",
    "documentId": "4a9f96c1ac5bf494a5a0f5e222c71017"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Resoconti stenografici/Fonti Parlamentari - Commissione Inchiesta 17^ leg - Resoconti - moby_prince-01_335801.pdf",
    "title": "Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 01 335801",
    "documentId": "8667f04378b9a662ce5d070f3dc22790"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Resoconti stenografici/Fonti Parlamentari - Commissione Inchiesta 17^ leg - Resoconti - moby_prince-02_335800.pdf",
    "title": "Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 02 335800",
    "documentId": "f16b1a862b6ed7f040275777cdc1c920"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Resoconti stenografici/Fonti Parlamentari - Commissione Inchiesta 17^ leg - Resoconti - moby_prince-03_335802.pdf",
    "title": "Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 03 335802",
    "documentId": "cb74abf64ae7f111820a6c60c83b9972"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Resoconti stenografici/Fonti Parlamentari - Commissione Inchiesta 17^ leg - Resoconti - moby_prince-04_335811.pdf",
    "title": "Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 04 335811",
    "documentId": "a94ed6b799cf1bd2213bec2ca945f79a"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Resoconti stenografici/Fonti Parlamentari - Commissione Inchiesta 17^ leg - Resoconti - moby_prince-05_335807.pdf",
    "title": "Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 05 335807",
    "documentId": "becef76d0fa57ffb5a4791d1498bb0e9"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Resoconti stenografici/Fonti Parlamentari - Commissione Inchiesta 17^ leg - Resoconti - moby_prince-06_335808.pdf",
    "title": "Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 06 335808",
    "documentId": "ad003c10b397c2ff97905efa8ceccd32"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Resoconti stenografici/Fonti Parlamentari - Commissione Inchiesta 17^ leg - Resoconti - moby_prince-07_335806.pdf",
    "title": "Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 07 335806",
    "documentId": "b625ed29c10aad97b04b131baf7b5d51"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Resoconti stenografici/Fonti Parlamentari - Commissione Inchiesta 17^ leg - Resoconti - moby_prince-08_335814.pdf",
    "title": "Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 08 335814",
    "documentId": "aa201e8abfe5a4778343b1b6fd290466"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Resoconti stenografici/Fonti Parlamentari - Commissione Inchiesta 17^ leg - Resoconti - moby_prince-09_335812.pdf",
    "title": "Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 09 335812",
    "documentId": "3ab01f483fb307b6a84891381c74fce7"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Resoconti stenografici/Fonti Parlamentari - Commissione Inchiesta 17^ leg - Resoconti - moby_prince-10_335813.pdf",
    "title": "Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 10 335813",
    "documentId": "c78ef5d9650d754750ced59b28d9c73d"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Resoconti stenografici/Fonti Parlamentari - Commissione Inchiesta 17^ leg - Resoconti - moby_prince-11_335809.pdf",
    "title": "Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 11 335809",
    "documentId": "338569b27fe31772ca9ae0bf9916d796"
  },
  {
    "uri": "gs://moby-prince/Fonti Parlamentari/Commissione d'Inchiesta/leg_17/Resoconti stenografici/Fonti Parlamentari - Commissione Inchiesta 17^ leg - Resoconti - moby_prince-12_335810.pdf",
    "title": "Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 12 335810",
    "documentId": "c96eee7fafea51997d21f7995df5ef13"
  }
]
```
