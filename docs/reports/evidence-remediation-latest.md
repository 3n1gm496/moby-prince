# Evidence Remediation Plan

Generato: 2026-04-24T09:01:09.089Z

## Summary

| Check | Value |
|---|---:|
| orphanEvents | 70 |
| orphanAnchorDocuments | 34 |
| orphanAnchors | 313 |
| duplicateSourceUris | 1 |
| normalizedDocuments | 36 |

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
| event-1991-04-10-descrizione-navi-cisterna-per-bunkera-dc7e303a | all'epoca del disastro | Descrizione navi cisterna per bunkeraggio |
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
| event-2016-01-01-audizione-professor-fiori-e-professor-3f73a91b | XVII Legislatura | Audizione Professor Fiori e Professor Chiarotti |
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
| event-2016-03-08-13-seduta-commissione-d-inchiesta-mob-0ae81e3d | martedì 8 marzo 2016 | 13ª seduta Commissione d'inchiesta Moby Prince |
| event-2016-03-08-audizione-carlo-cardi-38ce73c1 | martedì 8 marzo 2016 | Audizione Carlo Cardi |
| event-2016-03-08-audizione-commissione-parlamentare-mo-3557f83d | 8 marzo 2016 | Audizione Commissione Parlamentare Moby Prince (8 marzo 2016) |
| event-2016-03-15-14-seduta-della-commissione-parlament-62390d41 | martedì 15 marzo 2016 | 14ª Seduta della Commissione Parlamentare d’Inchiesta |
| event-2016-03-15-presidenza-della-commissione-d-inchie-21fbad3b | 15 marzo 2016 | Presidenza della Commissione d’inchiesta Moby Prince |
| event-2016-03-22-15-seduta-della-commissione-parlament-c45cb766 | martedì 22 marzo 2016 | 15ª seduta della Commissione Parlamentare d’Inchiesta |
| event-2016-03-22-data-del-disastro-9c89d1cd | martedì 22 marzo 2016 | Data del disastro |
| event-2016-03-31-16-seduta-della-commissione-parlament-40457344 | giovedì 31 marzo 2016 | 16ª seduta della Commissione Parlamentare d’Inchiesta |

## Orphan Anchors By Document

| Document ID | Orphan anchors | Orphan claim IDs |
|---|---:|---:|
| e4083994014c2f67e0e02937c8b5cb81 | 123 | 123 |
| 2fb11784e62779c325737ec95528816c | 37 | 37 |
| fa0ac4811b0fccd27582228075c1734c | 13 | 13 |
| e6227b735a89e8f5f3caaadfde135d88 | 12 | 12 |
| e3a28ed75e77c700716e8901b64a631c | 10 | 10 |
| e4ff306b6c29152a1c07d9ec489a556e | 8 | 8 |
| 8667f04378b9a662ce5d070f3dc22790 | 7 | 7 |
| c78ef5d9650d754750ced59b28d9c73d | 6 | 6 |
| 0714e3ed3cd7f4c291566c75fccf2cf5 | 5 | 5 |
| 4f1a12e12b03ec54f2dc7ceaf8525cd7 | 5 | 5 |
| 8ec2ace7546cf1d48af7654a84294c2e | 5 | 5 |
| b9d7d1b43539bdf00ee1a09dcc081a2e | 5 | 5 |
| 0b65db378421e3bfe66fb5e3a396187c | 4 | 4 |
| 685e7a551ce4beec119a69956da5701a | 4 | 4 |
| 79fadb7178cdeeb9d2905c73cdb01c66 | 4 | 4 |
| a5fc98a9ac5db60d5f0763deb66f544f | 4 | 4 |
| a94ed6b799cf1bd2213bec2ca945f79a | 4 | 4 |
| aa201e8abfe5a4778343b1b6fd290466 | 4 | 4 |
| c727376534d517b3e58f5e509d54042e | 4 | 4 |
| c96eee7fafea51997d21f7995df5ef13 | 4 | 4 |
| cceac19f0faaaf31ec72ba0b964dfadd | 4 | 4 |
| d020b9932e00c1fd21b5b4fc79496304 | 4 | 4 |
| ebb1e225a2ec1f459fe860defdfd712b | 4 | 4 |
| 338569b27fe31772ca9ae0bf9916d796 | 3 | 3 |
| 374074a0150a71499f2f598780b646b2 | 3 | 3 |
| 3ab01f483fb307b6a84891381c74fce7 | 3 | 3 |
| 3b1780054c53f11422e9a44d37b6d521 | 3 | 3 |
| ad003c10b397c2ff97905efa8ceccd32 | 3 | 3 |
| b625ed29c10aad97b04b131baf7b5d51 | 3 | 3 |
| becef76d0fa57ffb5a4791d1498bb0e9 | 3 | 3 |
| bfc7324f9d1654622e44a6664641fae8 | 3 | 3 |
| cb74abf64ae7f111820a6c60c83b9972 | 3 | 3 |
| f16b1a862b6ed7f040275777cdc1c920 | 3 | 3 |
| fefa8609141522848c116253627f1452 | 3 | 3 |

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
| fefa8609141522848c116253627f1452 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 28 335963 |
| 0b65db378421e3bfe66fb5e3a396187c | 3 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 27 335961 |
| 4f1a12e12b03ec54f2dc7ceaf8525cd7 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 26 335965 |
| bfc7324f9d1654622e44a6664641fae8 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 25 335962 |
| ebb1e225a2ec1f459fe860defdfd712b | 2 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 24 335960 |
| a5fc98a9ac5db60d5f0763deb66f544f | 2 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 23 335959 |
| b9d7d1b43539bdf00ee1a09dcc081a2e | 2 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 22 335958 |
| 685e7a551ce4beec119a69956da5701a | 2 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 21 335957 |
| d020b9932e00c1fd21b5b4fc79496304 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 20 335956 |
| c727376534d517b3e58f5e509d54042e | 3 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 19 335954 |
| 3b1780054c53f11422e9a44d37b6d521 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 18 335955 |
| e6227b735a89e8f5f3caaadfde135d88 | 3 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 17 335953 |
| 0714e3ed3cd7f4c291566c75fccf2cf5 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 16 335815 |
| 8ec2ace7546cf1d48af7654a84294c2e | 3 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 15 335804 |
| 79fadb7178cdeeb9d2905c73cdb01c66 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 14 335805 |
| cceac19f0faaaf31ec72ba0b964dfadd | 2 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 13 335803 |
| c96eee7fafea51997d21f7995df5ef13 | 3 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 12 335810 |
| 338569b27fe31772ca9ae0bf9916d796 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 11 335809 |
| c78ef5d9650d754750ced59b28d9c73d | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 10 335813 |
| 3ab01f483fb307b6a84891381c74fce7 | 1 | normalized_children_ready | Fonti Parlamentari Commissione Inchiesta 17^ leg Resoconti moby prince 09 335812 |
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
