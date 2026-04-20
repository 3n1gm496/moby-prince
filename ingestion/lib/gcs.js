'use strict';

/**
 * Shared GCS utilities for the ingestion pipeline.
 * Centralised here to avoid copy-paste across workers and entrypoints.
 */

/**
 * Parse a gs://bucket/path URI into its components.
 *
 * @param {string} uri  e.g. "gs://my-bucket/path/to/file.txt"
 * @returns {{ bucket: string, name: string }}
 * @throws {Error} if the URI is not a valid gs:// URI
 */
function parseGcsUri(uri) {
  const m = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`Invalid GCS URI: ${uri}`);
  return { bucket: m[1], name: m[2] };
}

module.exports = { parseGcsUri };
