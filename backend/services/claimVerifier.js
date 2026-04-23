'use strict';

const gemini = require('./gemini');
const { createLogger } = require('../logger');

const log = createLogger('claim-verifier');

async function verifyClaim(text, candidates) {
  if (!candidates || candidates.length === 0) {
    return { status: 'inconclusive', evidence: [] };
  }

  const claimsBlock = candidates.slice(0, 5).map((claim, index) =>
    `${index + 1}. [Doc: ${claim.documentId.slice(0, 8)}…] "${claim.text.slice(0, 200)}"`,
  ).join('\n');

  const prompt = `
Sei un analista del caso Moby Prince (disastro navale, 10 aprile 1991).

Testo da verificare: "${text.slice(0, 400)}"

Confronta questo testo con le seguenti affermazioni documentali e classifica la relazione:

${claimsBlock}

Rispondi con un array JSON (un elemento per affermazione):
[{"index": 1, "relationship": "supports" | "contradicts" | "neutral", "confidence": 0.0-1.0, "note": "breve spiegazione"}]
`.trim();

  let results;
  try {
    results = await gemini.generateJson(prompt);
    if (!Array.isArray(results)) results = [];
  } catch (err) {
    log.warn({ error: err.message }, 'Gemini claim verify failed');
    return { status: 'inconclusive', evidence: [] };
  }

  const evidence = results.map((result) => {
    const idx = (result.index || 1) - 1;
    const claim = candidates[idx] || candidates[0];
    return {
      claimId: claim?.id,
      documentId: claim?.documentId,
      claimText: claim?.text?.slice(0, 200),
      relationship: ['supports', 'contradicts', 'neutral'].includes(result.relationship)
        ? result.relationship
        : 'neutral',
      confidence: typeof result.confidence === 'number'
        ? Math.max(0, Math.min(1, result.confidence))
        : 0.5,
      note: typeof result.note === 'string' ? result.note.slice(0, 300) : null,
    };
  });

  const supports = evidence.filter((item) => item.relationship === 'supports');
  const contradicts = evidence.filter((item) => item.relationship === 'contradicts');
  const status =
    contradicts.length > supports.length ? 'contradicted' :
    supports.length > 0 ? 'supported' :
    'inconclusive';

  return { status, evidence };
}

module.exports = { verifyClaim };
