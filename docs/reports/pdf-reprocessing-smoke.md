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
- i child normalized vengono ora ricondotti al documento canonico `archiviazione-2010-2380025c`
- il reindex Discovery Engine dei child viene saltato intenzionalmente con `INDEX_SKIP_NORMALIZED_CHILDREN=true`
- il documento canonico viene aggiornato in `evidence.documents` con:
  - `normalized_uri = gs://moby-prince-normalized/moby-prince/Archiviazione-2010.normalized-manifest.json`
  - `chunk_count = 25`
  - `reprocessing_state = normalized_children_ready`
- l'entity extraction gira davvero sui child normalized dopo attivazione della Natural Language API
- il reprocessing live ha scritto `58` claim sul documento canonico, tutti con `page_reference`
- dopo rebuild anchors, il documento di smoke ha `58` anchor `page` e `58` anchor `text_span`

### Gap residui

- il datastore Discovery Engine corrente non accetta i child `text/html` come documenti canonici; il problema e' mitigato saltando il loro indexing
- l'estrazione entita' non e' ancora AI-first: oggi usa ancora la Natural Language API e non il layer canonico finale che vogliamo
- il documento padre resta in stato finale `SPLITTING`, mentre il valore archivisticamente corretto del progresso e' ormai "reprocessed with child evidence"; serve una materializzazione/stato esplicito nella pipeline o nel dataset
- `ocr_quality` resta `NULL` nel documento di smoke: il Layout Parser usato qui non ha restituito confidenze token spendibili

## Bug corretti durante lo smoke

1. `IndexerWorker` usava `PUT` sul resource path documenti.
   Corretto verso `PATCH ...?allowMissing=true`.

2. `DocumentAIWorker` produceva normalized `.txt`.
   Corretto verso output `.html`.

3. `ValidatorWorker` manteneva `contentType` con `; charset=...`.
   Corretto con normalizzazione del MIME.

4. `ingestion/config.js` era disallineato rispetto al bucket reale del corpus.
   Corretto con fallback a `GCS_BUCKET=moby-prince`.

5. I child Document AI scrivevano claim sul proprio `jobId`, perdendo il legame col documento canonico.
   Corretto con `canonical_document_id` e `canonical_source_uri`.

6. Ogni child avrebbe potuto cancellare i claim del documento precedente durante il purge.
   Corretto facendo il purge una sola volta sul primo child (`purge_claims=true` solo sul primo segmento).

7. Il reindex DE dei child interrompeva il flusso di claim extraction.
   Corretto con skip esplicito dell'indexing per child normalized e completamento del job con `documentId` canonico.

8. `EntityExtractionWorker` non inviava il quota project alla Natural Language API.
   Corretto aggiungendo `X-Goog-User-Project`.

9. La Natural Language API non era abilitata nel progetto Google Cloud.
   Corretta l'infrastruttura attivando `language.googleapis.com`.

10. Il `MERGE` su `evidence.documents` non tipizzava esplicitamente le costanti e falliva su BigQuery.
    Corretto con `CAST(... AS STRING|INT64)` nel `documentRegistry`.

## Diagnosi tecnica

La Fase 2 e l'inizio della Fase 4 sono oggi realmente riuscite sul documento di smoke:

- provisioning bucket: riuscito
- provisioning processor: riuscito
- OCR/sectioning PDF-first: riuscito
- normalized outputs persistiti: riuscito
- manifest normalized persistito: riuscito
- metadata documento padre in `documents`: riusciti
- claims con `page_reference`: riusciti
- page anchors strutturati: riusciti dopo rebuild `source_anchors`
- reindex Discovery Engine dei normalized children: non piu' necessario per il layer probatorio corrente
- entity extraction sui child normalized: riuscita, ma ancora su stack NL API legacy

## Prossimo blocco da risolvere

Serve chiudere questi punti:

1. portare lo stesso percorso sul batch corpus completo
2. rigenerare eventi ed entita' dal nuovo layer claims/anchors, non da quello storico
3. sostituire l'entity extraction NL API con il percorso AI-first/canonico finale
4. decidere se introdurre uno stato terminale esplicito per il parent job oltre a `reprocessing_state`

## Impatto sul piano

Non e' ancora prudente lanciare il batch completo sui `244` PDF`, ma il blocco principale e' cambiato:

- il percorso OCR -> normalized -> claims -> anchors e' praticabile
- il prossimo gate vero e' completare metadata/stato documentale e verificare l'estrazione entita'
- solo dopo ha senso avviare il batch completo del corpus
