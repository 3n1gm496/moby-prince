export function titleFromUri(uri) {
  if (!uri) return null;
  const filename = (uri.split("/").pop() || "").replace(/\.[^.]+$/, "");
  return filename.replace(/[_-]+/g, " ").trim() || null;
}

export function resolveSourceUri(uri) {
  if (!uri) return null;
  if (uri.startsWith("gs://")) {
    const withoutScheme = uri.slice(5);
    const slash = withoutScheme.indexOf("/");
    if (slash < 0) return null;
    const path = withoutScheme.slice(slash + 1);
    let decoded;
    try { decoded = decodeURIComponent(path); } catch { decoded = path; }
    return `/api/storage/file?name=${encodeURIComponent(decoded)}`;
  }
  return uri;
}

export function inferMimeType(uri, mimeType) {
  if (mimeType) return mimeType;
  if (!uri) return null;
  const lower = uri.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(lower)) return "image/*";
  if (/\.(mp4|mov|mpeg|mpg|webm|avi)$/i.test(lower)) return "video/*";
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(lower)) return "audio/*";
  return null;
}

export function parsePageIdentifier(source) {
  if (!source) return null;
  if (source.pageIdentifier) return String(source.pageIdentifier);
  if (source.pageReference) {
    const match = String(source.pageReference).match(/(\d{1,4})/);
    if (match) return match[1];
  }
  return null;
}

export function parseTimeIdentifier(source) {
  if (!source) return null;
  const raw = source.timeIdentifier || source.timestamp || source.timeReference || null;
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  const value = String(raw).trim();
  if (value.endsWith("s")) return Number.parseFloat(value) || null;
  const parts = value.split(":").map((part) => Number.parseFloat(part));
  if (parts.some((part) => Number.isNaN(part))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number.parseFloat(value) || null;
}

export function buildPdfUrl(uri, pageIdentifier) {
  const resolved = resolveSourceUri(uri);
  if (!resolved) return null;
  return pageIdentifier ? `${resolved}#page=${pageIdentifier}` : resolved;
}
