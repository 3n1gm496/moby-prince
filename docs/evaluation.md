# Evaluation Framework

L’evaluation del progetto misura tre cose:

- qualità del retrieval
- qualità della grounded answer
- qualità della provenance e della UX di consultazione

Non prova a misurare automaticamente concetti che il sistema non implementa più.

## Categorie benchmark

Le categorie operative correnti sono:

- `factual`
- `comparative`
- `source_lookup`
- `timeline`
- `out_of_corpus`

## Cosa misuriamo automaticamente

Signal utili già implementati in `eval/`:

- latenza risposta
- numero citazioni
- numero fonti/evidenze
- richiamo delle fonti attese (`expected_source_patterns`)
- presenza di stringhe chiave attese (`expected_answer_contains`)
- gestione corretta delle richieste fuori corpus

## Cosa richiede ancora revisione umana

Restano da valutare manualmente:

- correttezza sostanziale della risposta
- groundedness reale di ogni affermazione
- qualità delle citazioni
- qualità della timeline e della sintesi fra fonti

## Formato benchmark

Ogni riga di `eval/benchmark.jsonl` contiene:

- `id`
- `category`
- `difficulty`
- `query`
- `expected_answer_contains`
- `expected_source_patterns`
- `must_decline`
- `notes`

## Esecuzione

```bash
node eval/runner.js
node eval/runner.js --category timeline
node eval/runner.js --id factual-001
node eval/runner.js --search
```

## Principi

1. non introdurre categorie legacy che il prodotto non supporta più
2. non attribuire automaticamente conflitti documentali senza contesto
3. privilegiare benchmark che verificano fonti, attributi e date
4. usare la revisione umana per i casi ad alto valore investigativo

## Checklist minima per ogni run

- la risposta cita almeno una fonte quando la domanda è fattuale
- le fonti attese compaiono quando il benchmark le dichiara
- le query `out_of_corpus` vengono gestite con prudenza
- le query timeline non appiattiscono date incerte in fatti netti
- le query comparative non fondono versioni diverse senza attribuzione
