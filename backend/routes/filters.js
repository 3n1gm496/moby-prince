'use strict';

/**
 * GET /api/filters/schema
 *
 * Returns the authoritative filter schema as JSON so the frontend can derive
 * its UI from a single source of truth instead of duplicating the backend
 * schema in frontend/src/filters/schema.js.
 *
 * Response shape:
 * {
 *   schema: [
 *     {
 *       key:       string,
 *       label:     string,
 *       type:      'enum' | 'number' | 'text',
 *       available: boolean,
 *       values?:   string[],    // enum only
 *       min?:      number,      // number only
 *       max?:      number,      // number only
 *     }
 *   ]
 * }
 */

const { Router } = require('express');
const { SCHEMA } = require('../filters/schema');

const router = Router();

const _schemaResponse = (() => {
  const schema = Object.entries(SCHEMA).map(([key, spec]) => {
    const entry = {
      key,
      label:     spec.label,
      type:      spec.type,
      available: spec.available,
    };
    if (spec.values) entry.values = spec.values;
    if (spec.min   != null) entry.min = spec.min;
    if (spec.max   != null) entry.max = spec.max;
    return entry;
  });
  return { schema };
})();

router.get('/', (req, res) => {
  res.json(_schemaResponse);
});

module.exports = router;
