# PDF Reprocessing Batch

Generato: 2026-04-24T06:30:20.013Z

| Campo | Valore |
|---|---:|
| mode | execute |
| totalCorpusPdfs | 244 |
| candidatesAfterFiltering | 243 |
| selectedCount | 2 |
| completed | 2 |
| failed | 0 |

## Results

| # | Status | Document ID | Title |
|---:|---|---|---|
| 0 | completed | e4083994014c2f67e0e02937c8b5cb81 | Moby Prince Istanza Riapertura 11 10 2006 |
| 1 | completed | 2fb11784e62779c325737ec95528816c | Moby Prince Sentenza 1 (31.10.1998) |

## Verifica BigQuery post-run

| Document ID | Claims | Claims con pagina | Stato |
|---|---:|---:|---|
| e4083994014c2f67e0e02937c8b5cb81 | 41 | 41 | normalized_children_ready |
| 2fb11784e62779c325737ec95528816c | 61 | 61 | normalized_children_ready |

## Note operative

- Dopo il batch, un dry-run del runner ha ridotto i candidati da 243 a 241.
- `source_anchors` e' stato aggiornato in modo incrementale per i due documenti per evitare il blocco BigQuery su `DELETE` durante streaming buffer.
- Sono presenti anchor orfani storici su questi documenti; la bonifica va fatta con una finestra senza streaming buffer.
