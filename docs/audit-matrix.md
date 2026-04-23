# Audit Matrix

Matrice critica unica del progetto `moby-prince`.

Stati usati:

- `bloccante`
- `critico`
- `medio`
- `cosmetico`

Destinazioni finali:

- `tenere`
- `riscrivere`
- `rimuovere`
- `accorpare`

## Matrice

| Area | Stato attuale | Problema principale | Rischio | Priorità | Destinazione | Azione richiesta | Test di accettazione |
|---|---|---|---|---|---|---|---|
| Chat `/api/answer` + UI | Funziona, ma resta ibrida fra grounded answer e trace tecnica | Citazioni e limiti informativi non sono ancora al centro della UX | Risposte presentabili ma non ancora pienamente archivistiche | critico | riscrivere | Rendere la chat più evidence-first, allineare viewer e linguaggio | Domanda fattuale con fonti apribili e limiti espliciti |
| Search `/api/search` | Separata da answer ma poco differenziata nella UX | Ruolo funzionale non chiarissimo e shape non ancora usata come base comune viewer | Sovrapposizione concettuale e debito di manutenzione | medio | tenere | Chiarire uso retrieval-only, rafforzare test e docs | Search restituisce shape coerente con viewer e audit |
| Timeline UI | Legge dal layer strutturato, ma la resa è ancora migliorabile | Gerarchia visiva e ranking eventi non ancora “archivistici” | Timeline credibile ma non impeccabile in demo | critico | riscrivere | Rafforzare card, rilevanza, stati vuoti/errori e navigazione fonte | Ogni evento ha almeno una fonte apribile e card leggibile |
| Timeline API `/api/timeline/events` | Ora autorevole su BQ | Prima manteneva fallback GCS legacy | Deriva semantica e doppia verità | bloccante | tenere | Mantenere solo BigQuery, senza fallback legacy | 501 se BQ assente, nessuna risposta `source: gcs` |
| Endpoint `/api/events` | Ridondante rispetto alla timeline | Duplica il concetto evento con shape diversa | Contratti pubblici ambigui | critico | rimuovere | Rimuovere mount e codice morto | Solo `/api/timeline/events` resta operativo |
| Entità UI `/entita` | Superficie unificata con tab già presente | Docs e checklist erano incoerenti con la UI reale | Confusione prodotto/repo | critico | tenere | Allineare docs, routing, ranking, profili e linked events | `/entita?tab=persone` e profilo funzionano e sono documentati |
| Profili entità | Materializzati ma ancora minimali | Summary e contesto utili ma non ancora completi | Demo accettabile, non ancora autorevole | critico | riscrivere | Arricchire summary, documenti, claims, eventi e relazioni | Profilo entità mostra summary stabile + fonti/events coerenti |
| Claims API | Disponibile e utile | Verify e matching vanno posizionati meglio nel prodotto | Funzione valida ma ancora “tool-like” | medio | tenere | Tenere claims come layer di verifica secondaria | Claim verifier prudente e tracciabile |
| Dossier | Browser GCS solido ma ancora da “tooling” | Viewer e affordance non ancora abbastanza sobrie | Esperienza meno coerente del resto del prodotto | critico | riscrivere | Riallineare UX, metadata e apertura fonti | Dossier usa lo stesso modello `source + anchors` |
| Investigazione | Multi-step presente e credibile | Trace tecnica ancora troppo visibile | UX percepita da prototipo | critico | riscrivere | Collassare trace, evidenziare risposta finale, allineare viewer | Investigazione mostra risultato finale e fonti coerenti |
| Admin | Metriche base presenti | Mancano indicatori dataset/pipeline davvero utili | Dashboard poco spendibile in demo interna | medio | riscrivere | Tenere solo metriche affidabili e operative | Admin espone metriche reali e leggibili |
| Storage API | Copre browse/upload/rename/move/delete/metadata | Va verificata l’affidabilità DE sync e la UX file-side | Operazioni sensibili, rischio drift GCS/DE | critico | tenere | Hardening funzionale e audit delle operazioni file | Rename/move/delete non lasciano drift non spiegato |
| Sessions | Persistenza Firestore presente | Va rivista in ottica retention/concorrenza/export | Debito medio, non bloccante | medio | tenere | Rafforzare shape, retention e test concorrenza | Messaggi non si perdono con append concorrenti |
| Media API | Presente, ma il corpus reale è quasi tutto PDF | Superficie più pronta del dataset reale | Rischio investire prima del bisogno reale | medio | tenere | Mantenere ma dare priorità a PDF/Document AI | Media viewer e transcript restano coerenti |
| BigQuery services/repos | Forte miglioramento recente | Restano query critiche e mismatch da coprire con audit automatico | Bug dati silenziosi se non monitorati | critico | tenere | Aggiungere audit corpus e guardrail qualità | Audit corpus produce mismatch e qualità dati |
| Discovery Engine integration | Operativa | Docs e retrieval strategy ancora più avanti del runtime reale | Aspettative non allineate | medio | tenere | Allineare docs e runbook allo stato vero | List/search/answer coerenti con docs |
| Auth/API protection | Middleware `X-API-Key` operativo | Docs di deploy parlavano come se IAP bastasse da solo | Rischio operativo e di sicurezza | bloccante | riscrivere | Allineare codice e docs; supportare opzionalmente IAP trusted headers | API protette via API key o IAP trusted header esplicito |
| Ingestion pipeline | Struttura ricca, esecuzione parziale | Gap fra worker esistenti e pipeline realmente eseguita | Qualità corpus non ancora “perfetta” | bloccante | riscrivere | Reprocessing serio con Document AI + backfill strutturato | Corpus riallineato `GCS ↔ DE ↔ BQ` |
| Event extraction | Ora scarta fonti finte e entity ids invalidi | Serve ancora migliore merge/ranking eventi | Timeline pulita ma non ancora rifinita editorialmente | critico | riscrivere | Rafforzare consolidamento e ranking | Nessun evento senza fonti, meno duplicati semantici |
| Provenance / anchors | Contratto condiviso esiste | Mancano ancora page anchors reali su molti PDF | Blocco principale per la credibilità probatoria | bloccante | riscrivere | Reprocessing OCR/Document AI e backfill `page` anchors | Apertura PDF alla pagina esatta quando disponibile |
| Eval | Runner/scorer/documentazione esistono | Copertura ancora concentrata su answer/search | Manca regressione piena su timeline/entità/provenance | critico | riscrivere | Estendere benchmark e scorecard | Eval copre anche timeline, entità e prudenza date |
| Docs / README | Migliorati ma ancora con drift residuo | README, runtime, deployment e checklist non sempre rispecchiano il codice | Repo non ancora impeccabile | critico | riscrivere | Allineare tutta la documentazione al sistema reale | Docs senza incoerenze note su superfici e auth |
| Deploy / ops scripts | Presenti e utili | Da verificare contro stato reale, costi e IAM minimi | Deployment parzialmente documentato, runbook incompleto | critico | riscrivere | Hardening deploy, IAM, costi, rollback, monitoring | Deploy verificato e runbook eseguibile |
| Repo hygiene | Ancora presenti residui e drift | Legacy, duplicazioni, artefatti e naming incoerenti | Manutenzione più difficile del necessario | critico | rimuovere/accorpare | Cleanup continuo breaking e netto | Nessun codice morto o percorso duplicato non giustificato |

## Priorità immediate

1. Eliminare endpoint e fallback legacy che mantengono doppie verità
2. Rendere l’audit corpus ripetibile e versionato nel repo
3. Riallineare auth/deploy/docs al comportamento reale
4. Portare la provenance PDF verso page anchors strutturati
5. Estendere eval e test alle superfici non coperte
