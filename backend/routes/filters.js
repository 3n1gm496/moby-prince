'use strict';

/**
 * GET /api/filters/schema
 *
 * Returns the authoritative filter schema so the frontend can render its UI
 * from a single backend source instead of maintaining a parallel static copy.
 *
 * Response shape mirrors the frontend FILTER_SCHEMA array:
 * {
 *   schema: [
 *     {
 *       key:          string,
 *       label:        string,
 *       type:         'enum' | 'number' | 'text',
 *       available:    boolean,
 *       options?:     { value: string, label: string }[],  // enum only
 *       min?:         number,                              // number only
 *       max?:         number,                              // number only
 *       placeholder?: string,                             // text / number
 *     }
 *   ]
 * }
 */

const { Router } = require('express');
const { SCHEMA } = require('../filters/schema');

const router = Router();

// Build response once at startup — schema is static for the lifetime of the process.
const _schemaResponse = (() => {
  const schema = Object.entries(SCHEMA).map(([key, spec]) => {
    const entry = {
      key,
      label:     spec.label,
      type:      spec.type,
      available: spec.available,
    };
    if (spec.options)      entry.options     = spec.options;
    if (spec.min    != null) entry.min       = spec.min;
    if (spec.max    != null) entry.max       = spec.max;
    if (spec.placeholder)  entry.placeholder = spec.placeholder;
    return entry;
  });
  return { schema };
})();

router.get('/', (req, res) => {
  res.json(_schemaResponse);
});

module.exports = router;
