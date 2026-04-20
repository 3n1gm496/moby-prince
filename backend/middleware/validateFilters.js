'use strict';

const { validateFiltersObject } = require('../filters/schema');

function validateFilters(req, res, next) {
  const result = validateFiltersObject(req.body.filters);
  if (!result.valid) {
    return res.status(400).json({ error: result.error });
  }
  next();
}

module.exports = { validateFilters };
