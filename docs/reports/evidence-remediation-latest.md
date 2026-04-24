# Evidence Remediation Plan

Generato: 2026-04-24T08:28:46.044Z

## Summary

| Check | Value |
|---|---:|
| orphanEvents | 50 |
| orphanAnchorDocuments | 14 |
| orphanAnchors | 224 |
| duplicateSourceUris | 1 |
| normalizedDocuments | 16 |

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
| event-1991-04-10-mancata-comunicazione-tra-navi-e-auto-a55eb1d8 | 10 aprile 1991 | Mancata comunicazione tra navi e autorità portuali |
| event-1991-04-10-operazioni-di-trasbordo-di-armamenti-c29b1d11 | 10 aprile 1991 | Operazioni di trasbordo di armamenti |
| event-1991-04-10-oscuramento-della-petroliera-agip-abr-3fae7556 | prima della collisione del 10 aprile 1991 | Oscuramento della petroliera Agip Abruzzo |
| event-1991-04-10-partenza-della-margareth-lykes-523ec5f1 | sera dei fatti (10 aprile 1991) | Partenza della Margareth Lykes |
| event-1991-04-10-passeggeri-trovati-nella-sala-de-luxe-543559e1 | dopo la collisione del 10 aprile 1991 | Passeggeri trovati nella sala De Luxe |
| event-1991-04-10-presenza-di-alloggio-di-servizio-59ba39fc | sera del 10 aprile 1991 | Presenza di alloggio di servizio |
| event-1991-04-10-presenza-nave-teresa-nelle-acque-tirr-1f1beed7 | sera del 10 aprile 1991 | Presenza nave Teresa nelle acque tirreniche |
| event-1991-04-10-radar-delle-imbarcazioni-di-soccorso--8c40be74 | dopo la collisione del 10 aprile 1991 | Radar delle imbarcazioni di soccorso impazziscono |
| event-1991-04-10-savelli-giancarlo-and-losoni-paolo-mo-eadf0960 | 10/04/1991 | Savelli Giancarlo and Losoni Paolo monitoring VHF channel 16 |
| event-1991-04-10-situazione-di-preallarme-militare-nel-cd04fe62 | sera dei fatti (10 aprile 1991) | Situazione di preallarme militare nel porto di Livorno |
| event-1991-04-14-rilievi-sulla-petroliera-agip-abruzzo-b46aaef6 | 14 aprile 1991 | Rilievi sulla petroliera Agip Abruzzo |
| event-1995-03-31-rapporto-questura-di-livorno-digos-ebfc46c5 | 31 marzo 1995 | Rapporto Questura di Livorno – Digos |
| event-1998-10-31-tribunale-penale-di-livorno-sentence--b29b5eba | 31.10.1998 | Tribunale Penale di Livorno sentence pronounced |
| event-1999-01-01-conferma-responsabilita-snav-8bc61831 | 1999 | Conferma responsabilità SNAV |
| event-1999-01-01-critica-alla-gestione-delle-emergenze-f1cc5526 | 1999 | Critica alla gestione delle emergenze |
| event-2002-05-24-dichiarazione-di-john-t-oliver-sul-ru-f66c684b | 24 maggio 2002 | Dichiarazione di John T. Oliver sul ruolo delle navi americane |
| event-2002-05-24-risposta-del-capitano-di-vascello-joh-f25716c0 | 24 maggio 2002 | Risposta del Capitano di Vascello John T. Oliver |
| event-2007-12-24-legge-finanziaria-2007-769af21b | 24 dicembre 2007 | Legge finanziaria 2007 |
| event-2012-11-26-citazione-direttiva-2012-34-ue-450911ae | 2012 | Citazione direttiva 2012/34/UE |
| event-2015-07-22-istituzione-commissione-parlamentare--144f709b | 22 luglio 2015 | Istituzione Commissione Parlamentare d'Inchiesta Moby Prince |
| event-2015-12-17-audizione-durante-la-seduta-del-17-di-d8118afe | 17 dicembre 2015 | Audizione durante la seduta del 17 dicembre 2015 |
| event-2015-12-17-presidenza-della-seduta-da-parte-di-b-2271d677 | 17 dicembre 2015 | Presidenza della seduta da parte di Bachisio Lai |
| event-2015-12-17-terza-seduta-della-commissione-parlam-1527cd83 | giovedì 17 dicembre 2015 | Terza seduta della Commissione Parlamentare d'Inchiesta Moby Prince |
| event-2016-01-14-audizione-dei-senatori-chiti-e-matteo-bb45aef3 | giovedì 14 gennaio 2016 | Audizione dei senatori Chiti e Matteoli |
| event-2016-01-26-inizio-seduta-commissione-moby-prince-6ab58923 | 26 gennaio 2016 | Inizio seduta Commissione Moby Prince |
| event-2016-01-26-seduta-della-commissione-moby-prince-1129fadc | martedì 26 gennaio 2016 | Seduta della Commissione Moby Prince |
| event-2016-02-02-6-seduta-della-commissione-parlamenta-c44bdb96 | martedì 2 febbraio 2016 | 6ª seduta della Commissione Parlamentare d'Inchiesta |
| event-2016-02-09-audizione-legale-di-parte-civile-9bd5f19b | 9 febbraio 2016 | Audizione legale di parte civile |
| event-2016-02-09-commissione-parlamentare-d-inchiesta--7b09e007 | martedì 9 febbraio 2016 | Commissione Parlamentare d’Inchiesta sul disastro del traghetto Moby Prince - 7ª seduta |
| event-2016-02-10-8-seduta-della-commissione-parlamenta-851b5954 | mercoledì 10 febbraio 2016 | 8ª seduta della Commissione Parlamentare d'Inchiesta |
| event-2016-02-16-audizione-del-dottor-piero-mannironi--6cd4e247 | 16 febbraio 2016 | Audizione del dottor Piero Mannironi e del dottor Alberto Testa |
| event-2016-02-23-10-seduta-della-commissione-parlament-3ead86c0 | martedì 23 febbraio 2016 | 10ª seduta della Commissione Parlamentare d'Inchiesta |
| event-2016-02-23-audizione-avvocati-neri-e-galasso-7f5056c0 | 23 febbraio 2016 | Audizione avvocati Neri e Galasso |
| event-2016-07-31-relazione-della-commissione-parlament-7fc6a140 | dal 31 luglio 2016 al 31 gennaio 2017 | Relazione della Commissione Parlamentare d'Inchiesta |
| event-2016-12-06-incontro-tra-commissione-e-alessio-be-04a67ac3 | 6 dicembre 2016 | Incontro tra Commissione e Alessio Bertrand |
| event-2017-05-18-approvazione-e-comunicazione-della-re-7cae70f7 | 18 maggio 2017 | Approvazione e comunicazione della relazione della Commissione |
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
| fa0ac4811b0fccd27582228075c1734c | 13 | 13 |
| e3a28ed75e77c700716e8901b64a631c | 10 | 10 |
| e4ff306b6c29152a1c07d9ec489a556e | 8 | 8 |
| 8667f04378b9a662ce5d070f3dc22790 | 7 | 7 |
| a94ed6b799cf1bd2213bec2ca945f79a | 4 | 4 |
| aa201e8abfe5a4778343b1b6fd290466 | 4 | 4 |
| 374074a0150a71499f2f598780b646b2 | 3 | 3 |
| ad003c10b397c2ff97905efa8ceccd32 | 3 | 3 |
| b625ed29c10aad97b04b131baf7b5d51 | 3 | 3 |
| becef76d0fa57ffb5a4791d1498bb0e9 | 3 | 3 |
| cb74abf64ae7f111820a6c60c83b9972 | 3 | 3 |
| f16b1a862b6ed7f040275777cdc1c920 | 3 | 3 |

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
| aa201e8abfe5a4778343b1b6fd290466 | 4 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 08 335814 |
| b625ed29c10aad97b04b131baf7b5d51 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 07 335806 |
| ad003c10b397c2ff97905efa8ceccd32 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 06 335808 |
| becef76d0fa57ffb5a4791d1498bb0e9 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 05 335807 |
| a94ed6b799cf1bd2213bec2ca945f79a | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 04 335811 |
| cb74abf64ae7f111820a6c60c83b9972 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 03 335802 |
| f16b1a862b6ed7f040275777cdc1c920 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 02 335800 |
| 8667f04378b9a662ce5d070f3dc22790 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 01 335801 |
| 4a9f96c1ac5bf494a5a0f5e222c71017 | 125 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Relazione finale |
| e4ff306b6c29152a1c07d9ec489a556e | 11 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Relazione 22 bis n6 330368 |
| fa0ac4811b0fccd27582228075c1734c | 6 | normalized_children_ready | Regolamento definitivo |
| 374074a0150a71499f2f598780b646b2 | 1 | normalized_children_ready | delibera istitutiva |
| e3a28ed75e77c700716e8901b64a631c | 5 | normalized_children_ready | Sentenza Appello Firenze 1999 |
| 2fb11784e62779c325737ec95528816c | 25 | normalized_children_ready | Moby Prince Sentenza 1 (31.10.1998) |
| e4083994014c2f67e0e02937c8b5cb81 | 18 | normalized_children_ready | Moby Prince Istanza Riapertura 11 10 2006 |
| archiviazione-2010-2380025c | 25 | normalized_children_ready | Archiviazione-2010 |
