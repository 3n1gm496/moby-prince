'use strict';

const crypto = require('crypto');

function toDocumentId(filename) {
  const safeName = String(filename || '').trim();
  const hash = crypto.createHash('sha1').update(safeName).digest('hex').slice(0, 8);
  const slug = safeName
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'document'}-${hash}`.slice(0, 63);
}

module.exports = { toDocumentId };
