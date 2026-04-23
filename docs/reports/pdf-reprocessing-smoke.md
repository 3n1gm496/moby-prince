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
- il reprocessing live ha scritto `60` claim sul documento canonico, tutti con `page_reference`
- dopo rebuild anchors, il documento di smoke ha `60` anchor `page` e `60` anchor `text_span`

### Gap residui

- il datastore Discovery Engine corrente non accetta i child `text/html` come documenti canonici; il problema e' mitigato saltando il loro indexing
- l'estrazione entita' durante lo smoke falliva localmente con `Natural Language API 403` per mancanza di quota project ADC
- il worker NL e' stato corretto aggiungendo `X-Goog-User-Project`, ma questo fix non e' ancora stato ri-verificato con un nuovo smoke completo
- il documento padre resta in stato finale `SPLITTING`, mentre il valore archivisticamente corretto del progresso e' ormai "reprocessed with child evidence"; serve una materializzazione/stato esplicito nella pipeline o nel dataset

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

## Diagnosi tecnica

La Fase 2 e l'inizio della Fase 4 sono oggi realmente riuscite sul documento di smoke:

- provisioning bucket: riuscito
- provisioning processor: riuscito
- OCR/sectioning PDF-first: riuscito
- normalized outputs persistiti: riuscito
- claims con `page_reference`: riusciti
- page anchors strutturati: riusciti dopo rebuild `source_anchors`
- reindex Discovery Engine dei normalized children: non piu' necessario per il layer probatorio corrente

## Prossimo blocco da risolvere

Serve chiudere questi punti:

1. popolare `documents.normalized_uri`, `ocr_quality`, `chunk_count` e lo stato di reprocessing del documento padre
2. verificare di nuovo l'entity extraction dopo il fix `X-Goog-User-Project`
3. portare lo stesso percorso sul batch corpus completo
4. rigenerare eventi ed entita' dal nuovo layer claims/anchors, non da quello storico

## Impatto sul piano

Non e' ancora prudente lanciare il batch completo sui `244` PDF`, ma il blocco principale e' cambiato:

- il percorso OCR -> normalized -> claims -> anchors e' praticabile
- il prossimo gate vero e' completare metadata/stato documentale e verificare l'estrazione entita'
- solo dopo ha senso avviare il batch completo del corpus
