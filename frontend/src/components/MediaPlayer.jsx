import { useRef, useState, useEffect, useCallback } from "react";

// Convert a timestamp string like "12.5s", "00:01:23", or a raw number to seconds.
function parseTimestamp(t) {
  if (t == null) return 0;
  if (typeof t === "number") return t;
  const s = String(t).trim();
  if (s.endsWith("s")) return parseFloat(s) || 0;
  // HH:MM:SS or MM:SS
  const parts = s.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseFloat(s) || 0;
}

function formatTime(secs) {
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// Convert gs:// URI to /api/storage/file proxy URL (mirrors EvidenceSection logic)
function resolveGsUri(uri) {
  if (!uri) return null;
  if (!uri.startsWith("gs://")) return uri;
  const withoutScheme = uri.slice(5);
  const slash = withoutScheme.indexOf("/");
  if (slash < 0) return null;
  const p = withoutScheme.slice(slash + 1);
  let decoded;
  try { decoded = decodeURIComponent(p); } catch { decoded = p; }
  return `/api/storage/file?name=${encodeURIComponent(decoded)}`;
}

// ── ShotMarker ────────────────────────────────────────────────────────────────

function ShotMarker({ shot, duration, currentTime, onClick }) {
  if (!duration) return null;
  const startSec = parseTimestamp(shot.startTime);
  const left = `${Math.min((startSec / duration) * 100, 99.5)}%`;
  const isActive = currentTime >= startSec &&
    (shot.endTime == null || currentTime < parseTimestamp(shot.endTime));
  return (
    <button
      title={`Shot ${shot.index + 1} — ${formatTime(startSec)}`}
      onClick={() => onClick(startSec)}
      style={{ left }}
      className={`absolute top-0 bottom-0 w-0.5 transition-colors ${
        isActive ? "bg-accent" : "bg-white/30 hover:bg-white/60"
      }`}
    />
  );
}

// ── MediaPlayer ───────────────────────────────────────────────────────────────

/**
 * @param {string}   uri         gs:// or http URL of the media file
 * @param {string}   mimeType    'video/mp4' | 'audio/mpeg' | etc.
 * @param {number}   seekTo      optional timestamp in seconds to seek to on mount/change
 * @param {object[]} shots       optional array of { index, startTime, endTime }
 * @param {string}   transcript  optional plain-text transcript
 * @param {string}   className
 */
export default function MediaPlayer({
  uri,
  mimeType,
  seekTo,
  shots = [],
  transcript = "",
  className = "",
}) {
  const mediaRef   = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [showTx,      setShowTx]      = useState(false);
  const isVideo = mimeType?.startsWith("video/");

  const src = resolveGsUri(uri);

  // Seek when seekTo prop changes
  useEffect(() => {
    if (seekTo != null && mediaRef.current) {
      mediaRef.current.currentTime = seekTo;
      mediaRef.current.play().catch(() => {});
    }
  }, [seekTo]);

  const handleTimeUpdate = useCallback(() => {
    if (mediaRef.current) setCurrentTime(mediaRef.current.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (mediaRef.current) setDuration(mediaRef.current.duration || 0);
  }, []);

  const seekToTime = useCallback((secs) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = secs;
      mediaRef.current.play().catch(() => {});
    }
  }, []);

  if (!src) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`rounded-lg overflow-hidden bg-black/80 border border-border/40 ${className}`}>
      {/* Media element */}
      {isVideo ? (
        <video
          ref={mediaRef}
          src={src}
          controls
          className="w-full max-h-64 object-contain"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
        />
      ) : (
        <audio
          ref={mediaRef}
          src={src}
          controls
          className="w-full p-3"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
        />
      )}

      {/* Shot timeline (video only, when shots are available) */}
      {isVideo && shots.length > 0 && (
        <div className="relative h-5 bg-white/5 mx-2 mb-1 rounded overflow-hidden">
          {/* Progress bar */}
          <div
            className="absolute left-0 top-0 bottom-0 bg-accent/20 transition-all pointer-events-none"
            style={{ width: `${progress}%` }}
          />
          {shots.map((shot) => (
            <ShotMarker
              key={shot.index}
              shot={shot}
              duration={duration}
              currentTime={currentTime}
              onClick={seekToTime}
            />
          ))}
          <div className="absolute right-1 top-0.5 text-[9px] text-text-muted font-mono pointer-events-none">
            {formatTime(currentTime)}{duration > 0 ? ` / ${formatTime(duration)}` : ""}
          </div>
        </div>
      )}

      {/* Transcript toggle */}
      {transcript && (
        <div className="px-2 pb-2">
          <button
            onClick={() => setShowTx((v) => !v)}
            className="text-[10px] text-accent/70 hover:text-accent transition-colors flex items-center gap-1"
          >
            <svg className={`w-2.5 h-2.5 transition-transform ${showTx ? "rotate-90" : ""}`}
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {showTx ? "Nascondi trascrizione" : "Mostra trascrizione"}
          </button>
          {showTx && (
            <p className="mt-1.5 text-[11px] text-text-primary leading-relaxed
                          max-h-36 overflow-y-auto bg-surface/60 rounded p-2 whitespace-pre-wrap">
              {transcript}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
