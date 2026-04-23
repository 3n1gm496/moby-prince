# Runbook Di Reprocessing Completo Del Corpus

Ultimo aggiornamento: `2026-04-23`

Questo runbook traduce l'audit live del corpus in un piano esecutivo di riallineamento completo `GCS -> OCR/normalized -> claims/entities/events/anchors -> Discovery Engine -> UI`.

Report di riferimento:

- [Corpus Audit Latest](../reports/corpus-audit-latest.md)
- [Audit Matrix](../audit-matrix.md)

## Stato live rilevato

Snapshot del `2026-04-23`:

- `GCS raw`: `254` oggetti
- `Discovery Engine documents`: `245`
- `BigQuery documents`: `245`
- `claims`: `6506`
- `events`: `647`
- `entities`: `133`
- `source_anchors`: `6506`
- `entity_profiles`: `133`
- `evidence_links`: `0`

Qualita' documentale e provenance:

- `documents_without_normalized_uri`: `245/245`
- `documents_without_chunk_count`: `245/245`
- `documents_without_ocr_quality`: `245/245`
- `documents_with_split_parent`: `0/245`
- `claims_with_page_reference`: `0/6506`
- `pageAnchors`: `0/6506`
- `anchorTypes`: solo `text_span`

Composizione corpus:

- `244` PDF
- `1` TXT
- prevalenza `testimony`: `222` documenti

Segnali chiave:

- il layer strutturato e' coerente, ma non ancora probatorio forte
- il corpus reale e' quasi interamente PDF, quindi il reprocessing deve essere PDF-first
- oggi la provenance e' solo testuale, non di pagina
- il bucket contiene almeno un artefatto legacy esplicito: `gs://moby-prince/_timeline/events.json`

## Diagnosi

Il sistema oggi e' semanticamente usabile ma archivisticamente incompleto.

Funziona bene su:

- coerenza `documents -> claims -> events -> entities`
- assenza di eventi senza fonti reali
- assenza di entity id invalidi
- profili entita' materializzati

Non e' ancora all'altezza su:

- apertura PDF alla pagina esatta
- OCR/normalized outputs tracciati nel dataset
- chunk/page map affidabile
- metadati documentali (`ocr_quality`, `chunk_count`, `normalized_uri`)
- evidenze documentali secondarie (`evidence_links`)

## Obiettivo del reprocessing

Portare il corpus a questo stato target:

- ogni PDF ha output normalized persistito
- ogni claim rilevante ha `page_reference`
- gli anchor PDF usano `anchor_type = page` quando possibile
- il viewer apre la fonte sulla pagina esatta
- `documents.normalized_uri`, `chunk_count`, `ocr_quality` sono popolati
- Discovery Engine e BigQuery sono riallineati sul testo normalized
- eventi ed entita' vengono rigenerati dai claim arricchiti, non dal layer povero attuale

## Strategia

### Fase 0. Freeze e snapshot

Obiettivo:

- evitare drift mentre il corpus viene riallineato

Azioni:

- congelare scritture manuali o one-off nel dataset `evidence`
- esportare snapshot delle tabelle:
  - `documents`
  - `claims`
  - `events`
  - `entities`
  - `source_anchors`
  - `entity_profiles`
- salvare job id e timestamp della campagna

Accettazione:

- esiste uno snapshot recoverable del dataset pre-reprocessing

### Fase 1. Inventory reale GCS e classificazione oggetti

Obiettivo:

- separare corpus reale da artefatti legacy o ausiliari

Azioni:

- enumerare tutti i `254` oggetti raw
- costruire un manifest con:
  - `source_uri`
  - estensione
  - classe documento
  - path logico
  - id documento BQ corrispondente
  - stato DE
- classificare come:
  - `corpus`
  - `supporting`
  - `legacy`
  - `orphan`
- isolare `_timeline/events.json` e gli eventuali altri oggetti non-corpus

Accettazione:

- ogni oggetto GCS ha una classificazione
- il delta `254 vs 245` e' spiegato

### Fase 2. Bucket normalized e output OCR persistiti

Obiettivo:

- introdurre finalmente un layer normalized esplicito

Azioni:

- creare/configurare `BUCKET_NORMALIZED`
- per ogni PDF produrre e persistere:
  - testo OCR completo
  - pagine
  - sezioni/layout
  - metadati di confidenza OCR
- aggiornare `documents.normalized_uri`
- aggiornare `documents.ocr_quality`
- aggiornare `documents.chunk_count`

Tecnologia:

- `Document AI / Layout Parser` come motore primario
- niente fallback Gemini al posto dell'OCR strutturato

Accettazione:

- `documents_without_normalized_uri = 0`
- `documents_without_ocr_quality = 0`
- `documents_without_chunk_count = 0`

### Fase 3. Page map e split strutturato

Obiettivo:

- rendere tracciabile ogni pezzo di testo al numero pagina

Azioni:

- costruire una mappa `document -> pages -> spans/sections`
- introdurre split logici o child documents quando serve
- valorizzare `parent_document_id` per i documenti derivati
- mantenere un mapping stabile verso il PDF originale

Accettazione:

- ogni claim estraibile da PDF ha un percorso verso una pagina reale
- il corpus usa split/child document solo dove necessario e in modo tracciato

### Fase 4. Re-extraction claim con page reference

Obiettivo:

- rigenerare il layer atomicamente verificabile

Azioni:

- riestrarre i claim dai normalized outputs
- popolare:
  - `document_id`
  - `chunk_id`
  - `page_reference`
  - `confidence`
  - `status`
  - `extraction_method`
- mantenere soglia alta e scartare claim rumorosi

Accettazione:

- `claims_with_page_reference` alto per il corpus PDF
- riduzione drastica del layer solo `text_span`

### Fase 5. Source anchors strutturati

Obiettivo:

- fare di `source_anchors` il vero layer di provenance

Azioni:

- rigenerare `source_anchors` da claim arricchiti
- supportare almeno:
  - `page`
  - `text_span`
  - `timestamp`
  - `frame`
  - `shot`
- per i PDF creare anchor `page` con snippet/quote e confidenza

Accettazione:

- `pageAnchors > 0`
- viewer PDF apribile su pagina reale
- `anchorTypes` non limitati a `text_span`

### Fase 6. Re-extraction entita' e canonizzazione forte

Obiettivo:

- mantenere alta precisione, meno rumore OCR

Azioni:

- riestrarre entita' dai claim arricchiti
- usare:
  - registry seed
  - normalizzazione AI-assisted
  - dedup alias/OCR sporco
  - soglia alta di accettazione
- rigenerare `entity_profiles` in forma materializzata

Accettazione:

- nessun duplicato canonico grossolano sulle entita' principali
- profili coerenti con claims ed eventi aggiornati

### Fase 7. Re-extraction eventi e merge conservativo

Obiettivo:

- rigenerare la timeline dal layer probatorio migliorato

Azioni:

- riestrarre eventi a partire dai claim con pagina
- applicare merge conservativo:
  - data
  - soggetto
  - azione
  - contesto fonte
- mantenere tutte le fonti sullo stesso evento
- valorizzare `date_precision` in modo coerente

Accettazione:

- nessun evento senza fonte reale
- eventi con fonti apribili e piu' leggibili in timeline

### Fase 8. Reindex Discovery Engine e evidence links

Obiettivo:

- riallineare retrieval e structured layer

Azioni:

- reindicizzare testo normalized o chunk derivati
- materializzare `evidence_links` se il modello finale li mantiene
- verificare join affidabili `DE -> document -> claim -> anchor`

Accettazione:

- retrieval coerente con il testo normalized
- `evidence_links` valorizzati oppure rimossi formalmente dal modello se non servono

### Fase 9. Hardening prodotto

Obiettivo:

- far consumare alle superfici il nuovo layer dati, senza fallback opachi

Azioni:

- timeline usa `page` anchors quando presenti
- chat/citation panel usa apertura pagina reale
- entita', dossier, investigazione consumano lo stesso shape `source + anchors`
- rimozione dei fallback testuali quando esiste un anchor strutturato

Accettazione:

- demo flow completo con apertura pagina esatta sui PDF campionati

## Ordine operativo consigliato

1. inventory GCS e classificazione oggetti
2. provisioning normalized bucket e pipeline OCR
3. page map e split documentali
4. re-extraction claim + source anchors
5. re-extraction entita'
6. re-extraction eventi
7. reindex DE
8. hardening UI/API
9. audit finale e campionamento manuale

## Campioni obbligatori per QA

Verifiche manuali e automatiche su:

- collisione
- soccorsi
- incendio
- fasi giudiziarie
- commissioni parlamentari
- figure principali
- navi principali
- enti principali
- luoghi principali

## KPI di uscita

Il reprocessing puo' dirsi riuscito solo se:

- `documents_without_normalized_uri = 0`
- `documents_without_chunk_count = 0`
- `documents_without_ocr_quality = 0`
- `claims_with_page_reference` copre sostanzialmente il corpus PDF
- `pageAnchors` diventano uno shape reale del dataset
- timeline, chat, entita', dossier e investigazione aprono PDF sulla pagina corretta nei campioni chiave
- il delta GCS/DE/BQ e' spiegato e documentato
- il corpus audit finale non mostra orfani strutturali

## Rischi da gestire

- costi Document AI su campagna completa
- tempi di reprocessing e reindex
- drift tra dataset vecchio e nuovo durante la transizione
- possibili errori OCR su scansioni difficili
- merge eventi troppo aggressivo se non guidato dai claim arricchiti

## Decisioni gia' bloccate

- il corpus va riallineato anche per i documenti gia' ingestati
- il motore OCR per PDF deve essere strutturato, non solo multimodale generico
- la provenance precisa e' un requisito di prodotto, non un miglioramento opzionale
- il prodotto finale non deve mantenere doppi layer legacy per timeline o contraddizioni
