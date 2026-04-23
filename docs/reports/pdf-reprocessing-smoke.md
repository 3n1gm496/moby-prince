# PDF Reprocessing Smoke

Generato: `2026-04-23`

## Contesto

Smoke test eseguito dopo:

- creazione bucket `moby-prince-normalized`
- creazione bucket `moby-prince-quarantine`
- provisioning processor Document AI:
  - `OCR_PROCESSOR`: `56ad30ca7ebb15c8`
  - `LAYOUT_PARSER_PROCESSOR`: `450acd5e00e625ba`

Documento testato:

- `gs://moby-prince/Fonti Giudiziarie/Archiviazione-2010.pdf`

## Esito

### Successi

- validazione GCS del PDF riuscita
- submit e completamento LRO Document AI riusciti
- Layout Parser attivo
- `25` sezioni normalized generate in `gs://moby-prince-normalized/moby-prince/`
- output normalized convertito in `.html`

### Failure residue

Il blocco residuo non e' piu' Document AI ma Discovery Engine.

L'indicizzazione dei child normalized fallisce con errore `400` sul campo `content.mime_type`.

Messaggio osservato:

```text
Field "content.mime_type" must be one of [application/json, application/pdf, ...]
```

Questo significa che, nel datastore/endpoint attuale, i child documents `text/plain` o `text/html` non sono accettati come formato `content` per il path di indexing usato dalla pipeline.

## Bug corretti durante lo smoke

1. `IndexerWorker` usava `PUT` sul resource path documenti.
   Corretto verso `PATCH ...?allowMissing=true`.

2. `DocumentAIWorker` produceva normalized `.txt`.
   Corretto verso output `.html`.

3. `ValidatorWorker` manteneva `contentType` con `; charset=...`.
   Corretto con normalizzazione del MIME.

4. `ingestion/config.js` era disallineato rispetto al bucket reale del corpus.
   Corretto con fallback a `GCS_BUCKET=moby-prince`.

## Diagnosi tecnica

La Fase 2 e' oggi parzialmente riuscita:

- provisioning bucket: riuscito
- provisioning processor: riuscito
- OCR/sectioning PDF-first: riuscito
- normalized outputs persistiti: riuscito
- reindex Discovery Engine dei normalized children: ancora bloccato

## Prossimo blocco da risolvere

Serve scegliere e implementare uno di questi approcci:

1. cambiare strategia di indexing dei normalized child in un formato accettato dal datastore Discovery Engine corrente
2. evitare il reindex dei child e usare i normalized outputs come layer OCR/provenance/claims fuori da DE
3. rivedere il tipo di datastore / modalità di import in modo compatibile con i normalized documents

## Impatto sul piano

Non bisogna ancora lanciare la campagna completa sui `244` PDF.

La cosa corretta adesso e':

- chiudere il blocco di compatibilita' Discovery Engine
- poi rilanciare uno smoke completo verde
- solo dopo avviare il reprocessing batch del corpus
