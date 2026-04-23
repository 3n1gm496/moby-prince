# Evidence Architecture

## Obiettivo

Il sistema combina retrieval semantico e layer strutturato per rispondere a domande sul caso Moby Prince senza perdere la provenienza.

L’architettura segue un principio semplice:

- Discovery Engine serve per trovare documenti e chunk rilevanti
- BigQuery serve per modellare entità, eventi, claim e provenance precisa
- il frontend deve poter aprire ogni fonte con lo stesso viewer e lo stesso contratto dati

## Componenti

| Componente | Ruolo |
|---|---|
| Frontend React | UI di consultazione, timeline, entità, dossier e investigazione |
| Backend Express | REST, SSE, trasformazione risposte, query su BigQuery e Discovery Engine |
| Discovery Engine | retrieval semantico su documenti e chunk |
| BigQuery `evidence` | layer strutturato autorevole |
| Cloud Storage | corpus raw e normalized |
| Gemini | estrazione, verifica, sintesi e arricchimento |
| Ingestion workers | OCR, media processing, claim/entity/event extraction, backfill |

## Perché due layer

Solo retrieval non basta:

- ottimo per trovare testi rilevanti
- debole per timeline, join fra entità e navigazione strutturata

Solo layer strutturato non basta:

- ottimo per query controllate
- non sufficiente per domande aperte e ricerca esplorativa

Per questo il prodotto usa un modello ibrido:

1. ricerca e risposta grounded via Discovery Engine
2. navigazione strutturata via BigQuery
3. viewer unificato sopra un contratto comune `source + anchors`

## Contratti dati

Il prodotto si regge su quattro tipi principali:

- `claims`
- `events`
- `entities`
- `source_anchors`

Regola:

- `claims` sono l’unità minima che collega testo, documento ed eventuali entità/eventi
- `events` raggruppano claim compatibili sullo stesso fatto storico
- `entities` forniscono una registry canonica
- `source_anchors` permettono apertura precisa della fonte

## Viewer condiviso

Chat, timeline, profili entità, dossier e investigazione non devono avere logiche diverse.

Ogni fonte deve poter fornire:

- `title`
- `uri`
- `snippet`
- `mimeType`
- `anchors[]`

Tipi di anchor supportati:

- `page`
- `text_span`
- `timestamp`
- `frame`
- `shot`

## Flusso principale

### Chat

1. frontend chiama `/api/answer`
2. backend interroga Discovery Engine `:answer`
3. il backend normalizza citazioni ed evidenze
4. il frontend apre il viewer con le fonti collegate

### Timeline

1. frontend chiama `/api/timeline/events`
2. backend legge `events`, `claims`, `documents` e `source_anchors`
3. restituisce eventi già pronti per il rendering

### Entità

1. frontend chiama `/api/entities` o `/api/entities/:id/context`
2. backend legge `entities`, `claims`, `events`, `documents`, `entity_profiles`
3. la pagina mostra summary stabile, documenti, claim, eventi e correlazioni

## Reingestion e backfill

Per il corpus storico il requisito non è “supportato dal codice”, ma “rieseguito davvero”.

Il backfill deve:

1. riallineare `GCS ↔ DE ↔ BQ`
2. produrre claim e anchor strutturati
3. materializzare profili entità
4. ridurre i fallback testuali al minimo

## Non obiettivi attuali

L’architettura corrente non include più:

- classificazioni automatiche speculative fra versioni documentali eterogenee
- pagine separate per conflitti documentali
- pipeline dedicate a comparazioni automatiche fra chunk eterogenei

Quando le fonti divergono, il sistema deve:

- mostrarlo nella risposta o nella sintesi
- attribuire correttamente le versioni alle fonti
- evitare etichette binarie semplicistiche

## Criteri di qualità

L’architettura è considerata sana quando:

- il frontend non fa inferenze semantiche che dovrebbero stare nel dataset
- il backend espone shape stabili e coerenti
- ogni evento mostrato ha almeno una fonte apribile
- ogni profilo entità usa summary persistenti o cachate
- la documentazione descrive solo ciò che è davvero operativo
