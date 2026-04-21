'use strict';

/**
 * Investigation agent runner — ReAct-style multi-step reasoning loop.
 *
 * Orchestrates Gemini 2.0 Flash (function calling) over a set of tools that
 * expose the evidence layer (Discovery Engine, BigQuery, NL API).  Streams
 * progress as Server-Sent Event objects to the caller so the frontend can
 * render tool traces in real time.
 *
 * Loop:
 *   1. Send user query + tool definitions to Gemini
 *   2a. Gemini returns functionCall → execute tool, add result, loop
 *   2b. Gemini returns text        → emit final answer, finish
 *   3. If MAX_STEPS reached without text response → force final summary
 *
 * SSE events emitted via sendEvent(type, data):
 *   thinking     { stage }
 *   tool_call    { tool, args, step }
 *   tool_result  { tool, result, step, durationMs }
 *   answer       { text, steps }
 *   error        { message }
 */

const config           = require('../config');
const { getAccessToken } = require('./auth');
const { createLogger } = require('../logger');

const de             = require('./discoveryEngine');
const translation    = require('./translation');
const claimsRepo     = require('../repos/claims');
const entitiesRepo   = require('../repos/entities');
const contradictionsRepo = require('../repos/contradictions');
const detector       = require('./contradictionDetector');
const { isBigQueryEnabled } = require('./bigquery');

const log       = createLogger('agent-runner');
const MAX_STEPS = 6;
const TIMEOUT   = 90_000;  // per Gemini call

// ── Model endpoint ────────────────────────────────────────────────────────────

function _endpoint() {
  const location = config.geminiLocation;
  const model    = 'gemini-2.0-flash-001';
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
Sei un investigatore specializzato nel disastro del Moby Prince (traghetto incendiato
nel porto di Livorno il 10 aprile 1991, 140 vittime).

Il tuo compito è rispondere a domande complesse usando gli strumenti disponibili:
ricerca documenti, verifica affermazioni, analisi contraddizioni, recupero entità.

Istruzioni operative:
- Usa gli strumenti in sequenza logica: cerca prima, poi analizza, poi sintetizza
- Cita sempre le fonti documentali quando affermi un fatto
- Segnala esplicitamente se trovi contraddizioni tra testimonianze
- Rispondi sempre in italiano
- La risposta finale deve essere strutturata: fatto accertato / incerto / controverso
`.trim();

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOL_DECLARATIONS = [
  {
    name:        'search_documents',
    description: 'Cerca documenti nell\'archivio Moby Prince per parole chiave. Restituisce estratti di testo con metadati (titolo, fonte, anno).',
    parameters:  {
      type:       'OBJECT',
      properties: {
        query:      { type: 'STRING',  description: 'Query di ricerca in italiano' },
        maxResults: { type: 'INTEGER', description: 'Numero massimo risultati (1–10, default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name:        'verify_claim',
    description: 'Verifica un\'affermazione fattuale rispetto al corpus documentale e restituisce se è supportata, contraddetta o inconcludente.',
    parameters:  {
      type:       'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'Affermazione da verificare (frase completa)' },
      },
      required: ['text'],
    },
  },
  {
    name:        'list_contradictions',
    description: 'Recupera le contraddizioni documentali rilevate nel corpus. Utile per comparare testimonianze in conflitto.',
    parameters:  {
      type:       'OBJECT',
      properties: {
        severity:   { type: 'STRING', description: 'Filtra per gravità: minor | significant | major' },
        limit:      { type: 'INTEGER', description: 'Max risultati (default 5)' },
      },
    },
  },
  {
    name:        'get_entity_info',
    description: 'Recupera informazioni su una persona, organizzazione o nave citata nel corpus (alias, ruolo, claim correlati).',
    parameters:  {
      type:       'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Nome o alias da cercare' },
      },
      required: ['name'],
    },
  },
  {
    name:        'translate_text',
    description: 'Traduce in italiano un testo in un\'altra lingua (utile per documenti in inglese o francese presenti nel corpus).',
    parameters:  {
      type:       'OBJECT',
      properties: {
        text:           { type: 'STRING', description: 'Testo da tradurre' },
        sourceLanguage: { type: 'STRING', description: 'Codice lingua sorgente (en, fr, …). Omettere per auto-detect.' },
      },
      required: ['text'],
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────

async function _executeTool(name, args) {
  switch (name) {
    case 'search_documents': {
      const raw = await de.search(args.query || '', {
        maxResults: Math.min(args.maxResults || 5, 10),
        searchMode: 'CHUNKS',
      });
      // Return lightweight summary so context doesn't balloon
      const results = (raw.results || raw.searchResults || []).slice(0, 5).map(r => {
        const doc  = r.document || r.unstructuredDocumentInfo || {};
        const sd   = doc.structData || doc.derivedStructData || {};
        const text = r.chunk?.content || r.snippet?.content || sd.snippet || '';
        return {
          title:    sd.title      || doc.id || '(sconosciuto)',
          source:   sd.institution|| null,
          year:     sd.year       || null,
          excerpt:  text.slice(0, 500),
        };
      });
      return { results, total: results.length };
    }

    case 'verify_claim': {
      const text       = args.text || '';
      const candidates = await claimsRepo.findSimilar(text, [], 5);
      return detector.verifyClaim(text, candidates);
    }

    case 'list_contradictions': {
      if (!isBigQueryEnabled()) return { contradictions: [], note: 'BQ not configured' };
      const items = await contradictionsRepo.list({
        severity: args.severity || undefined,
        limit:    Math.min(args.limit || 5, 10),
      });
      return {
        contradictions: items.map(c => ({
          id:          c.id,
          severity:    c.severity,
          type:        c.contradictionType,
          description: c.description,
          status:      c.status,
        })),
        total: items.length,
      };
    }

    case 'get_entity_info': {
      if (!isBigQueryEnabled()) return { entities: [], note: 'BQ not configured' };
      const entities = await entitiesRepo.search(args.name || '', 5);
      return { entities: entities.map(e => ({
        id:            e.id,
        type:          e.entityType,
        canonicalName: e.canonicalName,
        aliases:       e.aliases,
        role:          e.role,
        description:   e.description,
      })) };
    }

    case 'translate_text': {
      const translated = await translation.translateOne(args.text || '', 'it');
      return { translatedText: translated };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Gemini call ───────────────────────────────────────────────────────────────

async function _callGemini(contents) {
  const token      = await getAccessToken();
  const controller = new AbortController();
  const timerId    = setTimeout(() => controller.abort(), TIMEOUT);

  let res;
  try {
    res = await fetch(_endpoint(), {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        tools:      [{ functionDeclarations: TOOL_DECLARATIONS }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        contents,
        generationConfig: {
          temperature:    0.2,
          maxOutputTokens: 4096,
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timerId);
    if (err.name === 'AbortError') throw new Error('Gemini timed out');
    throw err;
  }
  clearTimeout(timerId);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  return res.json();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the investigation agent for a user query.
 *
 * @param {string}   query       User's investigation question
 * @param {Function} sendEvent   (type: string, data: object) => void — SSE writer
 */
async function investigate(query, sendEvent) {
  const steps    = [];
  const contents = [{ role: 'user', parts: [{ text: query }] }];

  sendEvent('thinking', { stage: 'reasoning' });

  for (let step = 1; step <= MAX_STEPS; step++) {
    let geminiResponse;
    try {
      geminiResponse = await _callGemini(contents);
    } catch (err) {
      log.error({ step, error: err.message }, 'Gemini call failed in agent loop');
      sendEvent('error', { message: 'Il servizio di ragionamento non è disponibile. Riprova tra qualche secondo.' });
      return;
    }

    const candidate = geminiResponse.candidates?.[0];
    const parts     = candidate?.content?.parts || [];

    // Check for text (final answer)
    const textPart = parts.find(p => typeof p.text === 'string' && p.text.trim());
    if (textPart) {
      sendEvent('answer', { text: textPart.text.trim(), steps });
      return;
    }

    // Check for function call
    const fnPart = parts.find(p => p.functionCall);
    if (!fnPart) {
      // Gemini returned nothing useful — emit what we have
      sendEvent('answer', {
        text: steps.length > 0
          ? 'Analisi completata. ' + steps.map(s => s.summary).filter(Boolean).join(' ')
          : 'Non ho trovato informazioni sufficienti per rispondere.',
        steps,
      });
      return;
    }

    const { name, args } = fnPart.functionCall;
    const stepInfo = { tool: name, args, step };

    sendEvent('tool_call', stepInfo);

    // Execute the tool
    const t0 = Date.now();
    let toolResult;
    let toolError = null;
    try {
      toolResult = await _executeTool(name, args || {});
    } catch (err) {
      toolError  = err.message;
      toolResult = { error: err.message };
      log.warn({ step, tool: name, error: err.message }, 'Tool execution failed');
    }
    const durationMs = Date.now() - t0;

    sendEvent('tool_result', { ...stepInfo, result: toolResult, durationMs, error: toolError });

    // Record step for final answer
    steps.push({
      step,
      tool:     name,
      args,
      result:   toolResult,
      durationMs,
      summary:  `${name}(${JSON.stringify(args).slice(0, 80)})`,
    });

    // Add assistant function call + tool result to conversation
    contents.push({
      role:  'model',
      parts: [{ functionCall: { name, args } }],
    });
    contents.push({
      role:  'tool',
      parts: [{ functionResponse: { name, response: toolResult } }],
    });

    sendEvent('thinking', { stage: 'reasoning', step });
  }

  // Max steps reached — ask Gemini for a final synthesis
  try {
    contents.push({
      role:  'user',
      parts: [{ text: 'Sintetizza le informazioni raccolte e fornisci la risposta finale.' }],
    });
    const finalResponse = await _callGemini(contents);
    const finalText = finalResponse.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
    sendEvent('answer', { text: finalText?.trim() || 'Analisi completata.', steps });
  } catch (err) {
    sendEvent('answer', {
      text:  'Analisi completata dopo il numero massimo di passaggi.',
      steps,
    });
  }
}

module.exports = { investigate };
