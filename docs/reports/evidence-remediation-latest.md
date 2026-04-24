# Evidence Remediation Plan

Generato: 2026-04-24T07:00:31.477Z

## Summary

| Check | Value |
|---|---:|
| orphanEvents | 27 |
| orphanAnchorDocuments | 2 |
| orphanAnchors | 160 |
| duplicateSourceUris | 1 |
| normalizedDocuments | 3 |

## Recommended Order

1. Stop broad corpus batches until claim IDs are deterministic in production code.
2. For already reprocessed documents, wait for BigQuery streaming buffers to drain before destructive cleanup.
3. Delete orphan source_anchors where claim_id no longer exists, scoped by affected document_id.
4. Resolve duplicate documents by migrating or dropping the filename-derived duplicate after checking dependent claims/events.
5. Regenerate events from the fully reprocessed claims layer, then replace the historical events table in one controlled window.
6. Run audit-corpus and require orphanEvents=0, anchorsWithoutClaims=0, duplicateDocumentSourceUris=0 before demo use.

## Orphan Events

| Event ID | Date | Title |
|---|---|---|
| event-1991-03-15-notifica-dal-dipartimento-dell-eserci-dfe1674f | 15 marzo 1991 | Notifica dal Dipartimento dell'Esercito degli Stati Uniti |
| event-1991-03-19-richiesta-acquisizione-atti-ministeri-69e7dcd8 | 19 marzo 1991 | Richiesta acquisizione atti ministeriali |
| event-1991-04-10-assenza-di-indicazioni-precise-sul-pu-3ef58aa1 | prima della collisione del 10 aprile 1991 | Assenza di indicazioni precise sul punto di fonda dell'Agip Abruzzo |
| event-1991-04-10-comunicazione-punto-di-fonda-dell-agi-aef294ec | dopo la collisione del 10 aprile 1991 | Comunicazione punto di fonda dell'Agip Abruzzo |
| event-1991-04-10-dichiarazione-di-marcella-bini-6331a2b8 | intorno alle 22:25 del 10 aprile 1991 | Dichiarazione di Marcella Bini |
| event-1991-04-10-dichiarazione-di-massimo-vernace-a3b23700 | circa mezz'ora dopo la collisione del 10 aprile 1991 | Dichiarazione di Massimo Vernace |
| event-1991-04-10-dichiarazione-di-roberto-del-seppia-7df96090 | sera del 10 aprile 1991 | Dichiarazione di Roberto Del Seppia |
| event-1991-04-10-operazioni-di-trasbordo-di-armamenti-c29b1d11 | 10 aprile 1991 | Operazioni di trasbordo di armamenti |
| event-1991-04-10-oscuramento-della-petroliera-agip-abr-3fae7556 | prima della collisione del 10 aprile 1991 | Oscuramento della petroliera Agip Abruzzo |
| event-1991-04-10-partenza-della-margareth-lykes-523ec5f1 | sera dei fatti (10 aprile 1991) | Partenza della Margareth Lykes |
| event-1991-04-10-passeggeri-trovati-nella-sala-de-luxe-543559e1 | dopo la collisione del 10 aprile 1991 | Passeggeri trovati nella sala De Luxe |
| event-1991-04-10-presenza-di-alloggio-di-servizio-59ba39fc | sera del 10 aprile 1991 | Presenza di alloggio di servizio |
| event-1991-04-10-presenza-nave-teresa-nelle-acque-tirr-1f1beed7 | sera del 10 aprile 1991 | Presenza nave Teresa nelle acque tirreniche |
| event-1991-04-10-radar-delle-imbarcazioni-di-soccorso--8c40be74 | dopo la collisione del 10 aprile 1991 | Radar delle imbarcazioni di soccorso impazziscono |
| event-1991-04-10-savelli-giancarlo-and-losoni-paolo-mo-eadf0960 | 10/04/1991 | Savelli Giancarlo and Losoni Paolo monitoring VHF channel 16 |
| event-1991-04-10-situazione-di-preallarme-militare-nel-cd04fe62 | sera dei fatti (10 aprile 1991) | Situazione di preallarme militare nel porto di Livorno |
| event-1995-03-31-rapporto-questura-di-livorno-digos-ebfc46c5 | 31 marzo 1995 | Rapporto Questura di Livorno – Digos |
| event-1998-10-31-tribunale-penale-di-livorno-sentence--b29b5eba | 31.10.1998 | Tribunale Penale di Livorno sentence pronounced |
| event-2002-05-24-dichiarazione-di-john-t-oliver-sul-ru-f66c684b | 24 maggio 2002 | Dichiarazione di John T. Oliver sul ruolo delle navi americane |
| event-2002-05-24-risposta-del-capitano-di-vascello-joh-f25716c0 | 24 maggio 2002 | Risposta del Capitano di Vascello John T. Oliver |
| event-04-10-first-tugboat-connects-to-moby-prince-d48bef76 | 04:10 | First tugboat connects to Moby Prince |
| event-ore-20-23-20-ipl-communication-with-moby-prince-1dc9f639 | Ore 20.23.20 | IPL communication with Moby Prince |
| event-ore-20-22-20-moby-prince-communication-with-livo-0d876db6 | Ore 20.22.20 | Moby Prince communication with Livorno Radio |
| event-23-45-33-moby-prince-on-fire-18d5134c | 23.45.33 | Moby Prince on fire |
| event-22-14-visibility-described-as-discrete-1bf63b41 | 22:14 | Visibility described as discrete |
| event-22-20-witness-observes-agip-abruzzo-s-course-051b65c2 | 22:20 | Witness observes Agip Abruzzo's course |
| event-22-20-witness-sees-agip-abruzzo-and-other-ships-5fe02ee5 | 22:20 | Witness sees Agip Abruzzo and other ships |

## Orphan Anchors By Document

| Document ID | Orphan anchors | Orphan claim IDs |
|---|---:|---:|
| e4083994014c2f67e0e02937c8b5cb81 | 123 | 123 |
| 2fb11784e62779c325737ec95528816c | 37 | 37 |

## Duplicate Documents

```json
[
  {
    "source_uri": "gs://moby-prince/Fonti Giudiziarie/Archiviazione-2010.pdf",
    "row_count": 2,
    "document_ids": [
      "01b1b75b253a3cd8351cc962c253ba44",
      "archiviazione-2010-2380025c"
    ]
  }
]
```

## Normalized Documents

| Document ID | Chunks | State | Title |
|---|---:|---|---|
| 2fb11784e62779c325737ec95528816c | 25 | normalized_children_ready | Moby Prince Sentenza 1 (31.10.1998) |
| e4083994014c2f67e0e02937c8b5cb81 | 18 | normalized_children_ready | Moby Prince Istanza Riapertura 11 10 2006 |
| archiviazione-2010-2380025c | 25 | normalized_children_ready | Archiviazione-2010 |
