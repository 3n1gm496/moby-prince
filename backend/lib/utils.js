'use strict';

/**
 * Shared backend utilities — used by routes and transformers.
 * Centralised here to avoid copy-paste drift across modules.
 */

/**
 * Clamp an integer query parameter to [min, max], returning fallback when
 * the value is absent or not a valid integer.
 *
 * @param {any}    value     Raw value from req.body (may be string, undefined, etc.)
 * @param {number} min
 * @param {number} max
 * @param {number} fallback  Returned when value is not a valid integer
 * @returns {number}
 */
function clamp(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * Return only the non-null/non-empty entries from a filters object, or null
 * if no active filters exist.  Used by transformers to echo applied filters
 * back to the client without sending the full schema.
 *
 * @param {object|null} filters
 * @returns {object|null}
 */
function activeFilters(filters) {
  if (!filters || typeof filters !== 'object') return null;
  const active = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  );
  return Object.keys(active).length > 0 ? active : null;
}

/**
 * Generate a random UUID, falling back to a timestamp-based ID on very old
 * Node versions that do not expose crypto.randomUUID.
 *
 * @returns {string}
 */
function newId() {
  try { return require('crypto').randomUUID(); }
  catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
}

module.exports = { clamp, activeFilters, newId };
