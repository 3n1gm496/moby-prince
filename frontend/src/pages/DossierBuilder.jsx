import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useGcsBrowser } from "../hooks/useGcsBrowser";
import DocumentPanel from "../components/DocumentPanel";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return null; }
}

function fileIconType(contentType) {
  if (!contentType) return "doc";
  if (contentType.includes("pdf"))   return "pdf";
  if (contentType.includes("word") || contentType.includes("document")) return "doc";
  if (contentType.includes("sheet") || contentType.includes("excel"))   return "xls";
  if (contentType.includes("image")) return "img";
  if (contentType.includes("text"))  return "txt";
  return "doc";
}

const FILE_ICON_COLORS = {
  pdf: "text-red-400",
  doc: "text-blue-400",
  xls: "text-green-400",
  img: "text-purple-400",
  txt: "text-text-secondary",
};

function gcsFileToDoc(file) {
  return {
    id:                file.fullPath,
    title:             file.name,
    uri:               null,
    mimeType:          file.contentType,
    metadata:          {},
    metadataAvailable: {},
    snippet:           null,
    hasChunks:         true,
    source:            "gcs",
    gcs: {
      name:        file.name,
      fullPath:    file.fullPath,
      size:        file.size,
      contentType: file.contentType,
      updated:     file.updated,
    },
  };
}

// ── FolderCard ────────────────────────────────────────────────────────────────

function FolderCard({ name, folderPrefix, onClick, onFileDrop }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const srcPath = e.dataTransfer.getData("text/plain");
    if (srcPath) onFileDrop?.(srcPath, folderPrefix);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-xl border transition-colors duration-150 group
                  ${dragOver
                    ? "border-accent bg-accent/8 scale-[1.01]"
                    : "border-border hover:border-accent/40 bg-surface-raised"}`}
    >
      <button
        onClick={onClick}
        className="text-left w-full px-4 py-3.5 flex items-center gap-3"
      >
        <svg className="w-8 h-8 flex-shrink-0 text-amber-400/80 group-hover:text-amber-400 transition-colors"
             fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
        </svg>
        <span className="flex-1 truncate text-[13px] font-medium text-text-primary
                         group-hover:text-accent transition-colors">
          {name}
        </span>
        <svg className="w-3.5 h-3.5 text-text-muted/50 group-hover:text-accent/60 transition-colors flex-shrink-0"
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

// ── FileCard ──────────────────────────────────────────────────────────────────

function FileCard({ file, onClick, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const icon  = fileIconType(file.contentType);
  const color = FILE_ICON_COLORS[icon] || "text-text-secondary";

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete?.(file);
    } else {
      setConfirmDelete(true);
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", file.fullPath);
        e.dataTransfer.effectAllowed = "move";
      }}
      onMouseLeave={() => setConfirmDelete(false)}
      className="relative group rounded-xl border border-border bg-surface-raised
                 hover:border-accent/40 transition-colors duration-150 cursor-grab active:cursor-grabbing"
    >
      <button
        onClick={onClick}
        className="text-left w-full px-4 py-3.5 flex items-start gap-3"
      >
        <svg className={`w-7 h-7 flex-shrink-0 mt-0.5 ${color}`}
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-text-primary leading-snug
                        group-hover:text-accent transition-colors line-clamp-2 break-words">
            {file.name}
          </p>
          <p className="text-[10px] text-text-muted mt-1 flex items-center gap-2">
            {formatBytes(file.size) && <span>{formatBytes(file.size)}</span>}
            {formatDate(file.updated) && <span>{formatDate(file.updated)}</span>}
          </p>
        </div>
      </button>

      {/* Delete button — visible on hover */}
      <button
        onClick={handleDeleteClick}
        title={confirmDelete ? "Clicca per confermare" : "Elimina file"}
        className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all duration-150
                    opacity-0 group-hover:opacity-100
                    ${confirmDelete
                      ? "opacity-100 bg-red-500 text-white"
                      : "bg-surface text-text-muted hover:text-red-400 hover:bg-red-500/10"}`}
      >
        {confirmDelete ? (
          <span className="text-[9px] font-semibold px-0.5 leading-none">OK?</span>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        )}
      </button>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface-raised px-4 py-3.5 flex items-center gap-3">
          <div className="w-7 h-7 bg-surface rounded animate-shimmer flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-surface rounded-full w-3/4 animate-shimmer" />
            <div className="h-2 bg-surface rounded-full w-1/3 animate-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── UploadButton ──────────────────────────────────────────────────────────────

function UploadButton({ prefix, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState(null);

  const handleFiles = async (fileList) => {
    if (!fileList?.length) return;
    setUploading(true);
    setUploadErr(null);

    let failed = 0;
    for (const file of Array.from(fileList)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("prefix", prefix);
      try {
        const res = await fetch("/api/storage/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        failed++;
        setUploadErr(err.message);
      }
    }

    setUploading(false);
    if (!failed) onUploaded?.();
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        onClick={() => { setUploadErr(null); inputRef.current?.click(); }}
        disabled={uploading}
        title={uploadErr || undefined}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border transition-colors
                    ${uploadErr
                      ? "border-red-500/40 text-red-400 bg-red-500/5 hover:bg-red-500/10"
                      : "border-border text-text-secondary hover:text-text-primary hover:border-accent/40"
                    }
                    disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {uploading ? (
          <>
            <span className="w-3 h-3 rounded-full border-2 border-text-muted/40 border-t-text-primary animate-spin" />
            Caricamento…
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Carica
          </>
        )}
      </button>
    </div>
  );
}

// ── DropTarget ────────────────────────────────────────────────────────────────
// Render-prop wrapper that adds drag-over / drop handling to any element.

function DropTarget({ onFileDrop, children }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const src = e.dataTransfer.getData("text/plain");
        if (src) onFileDrop?.(src);
      }}
    >
      {children(dragOver)}
    </div>
  );
}

// ── NewFolderButton ───────────────────────────────────────────────────────────

function NewFolderButton({ prefix, onCreated }) {
  const [mode,    setMode]    = useState("idle"); // idle | typing | saving
  const [name,    setName]    = useState("");
  const [err,     setErr]     = useState(null);
  const inputRef              = useRef(null);

  const open = () => { setMode("typing"); setName(""); setErr(null); setTimeout(() => inputRef.current?.focus(), 0); };
  const cancel = () => { setMode("idle"); setName(""); setErr(null); };

  const save = async () => {
    const folderName = name.trim().replace(/\//g, "_");
    if (!folderName) return;
    setMode("saving");
    try {
      const dest = `${prefix}${folderName}/`;
      const fd = new FormData();
      fd.append("file", new Blob([], { type: "application/x-directory" }), ".keep");
      fd.append("prefix", dest);
      const res = await fetch("/api/storage/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cancel();
      onCreated?.();
    } catch (e) {
      setErr(e.message);
      setMode("typing");
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter")  save();
    if (e.key === "Escape") cancel();
  };

  if (mode === "idle") {
    return (
      <button
        onClick={open}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border border-border
                   text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        Nuova cartella
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Nome cartella"
        disabled={mode === "saving"}
        title={err || undefined}
        className={`px-2.5 py-1.5 rounded-lg text-[12px] border bg-surface-raised
                    text-text-primary placeholder:text-text-muted w-36
                    focus:outline-none focus:border-accent/60
                    ${err ? "border-red-500/50" : "border-border"}`}
      />
      <button
        onClick={save}
        disabled={mode === "saving" || !name.trim()}
        className="px-2.5 py-1.5 rounded-lg text-[12px] bg-accent text-white
                   hover:bg-accent-hover transition-colors disabled:opacity-40"
      >
        {mode === "saving" ? "…" : "Crea"}
      </button>
      <button
        onClick={cancel}
        className="px-2 py-1.5 rounded-lg text-[12px] text-text-muted hover:text-text-primary transition-colors"
      >
        ✕
      </button>
    </div>
  );
}

// ── DossierBuilder ────────────────────────────────────────────────────────────

export default function DossierBuilder() {
  const {
    prefix, folders, files, loading, error, initialized,
    breadcrumb, navigate, back, refresh,
  } = useGcsBrowser();

  const [selectedFile, setSelectedFile] = useState(null);
  const [actionError,  setActionError]  = useState(null);

  // Compute parent prefix for "Cartella superiore" drop target
  const parentPrefix = prefix
    ? prefix.slice(0, prefix.slice(0, -1).lastIndexOf("/") + 1)
    : null;

  const handleDelete = useCallback(async (file) => {
    setActionError(null);
    try {
      const res = await fetch(
        `/api/storage/file?name=${encodeURIComponent(file.fullPath)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refresh();
    } catch (e) {
      setActionError(`Impossibile eliminare "${file.name}": ${e.message}`);
    }
  }, [refresh]);

  const handleMove = useCallback(async (srcPath, targetPrefix) => {
    const filename    = srcPath.split("/").pop();
    const destination = `${targetPrefix}${filename}`;
    if (srcPath === destination) return;
    setActionError(null);
    try {
      const res = await fetch("/api/storage/move", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ source: srcPath, destination }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refresh();
    } catch (e) {
      setActionError(`Impossibile spostare il file: ${e.message}`);
    }
  }, [refresh]);

  const isEmpty  = initialized && !loading && folders.length === 0 && files.length === 0 && !error;
  const hasItems = folders.length > 0 || files.length > 0;

  return (
    <div className="min-h-screen bg-surface flex flex-col">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-border/30 bg-surface-sidebar/80
                         backdrop-blur-md sticky top-0 z-10 print:hidden">
        <div className="max-w-[1100px] mx-auto px-5 py-3 flex items-center gap-3 min-w-0">

          <Link
            to="/"
            className="flex items-center gap-1.5 text-[11px] text-text-secondary
                       hover:text-text-primary transition-colors flex-shrink-0"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Consultazione
          </Link>

          <span className="text-border/60 flex-shrink-0">·</span>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 min-w-0 flex-1 text-[12px] overflow-hidden">
            <button
              onClick={() => navigate("")}
              className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className={breadcrumb.length === 0 ? "font-medium text-text-primary" : ""}>
                Archivio
              </span>
            </button>
            {breadcrumb.map(({ label, prefix: crumbPrefix }, i) => (
              <span key={crumbPrefix} className="flex items-center gap-1 min-w-0">
                <svg className="w-2.5 h-2.5 text-text-muted/50 flex-shrink-0"
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <button
                  onClick={() => navigate(crumbPrefix)}
                  className={`truncate transition-colors max-w-[120px] ${
                    i === breadcrumb.length - 1
                      ? "font-medium text-text-primary"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                  title={label}
                >
                  {label}
                </button>
              </span>
            ))}
          </nav>

          {/* Item count */}
          {hasItems && !loading && (
            <span className="text-[11px] text-text-muted flex-shrink-0 tabular-nums">
              {[
                folders.length > 0 && `${folders.length} cartel${folders.length === 1 ? "la" : "le"}`,
                files.length   > 0 && `${files.length} file`,
              ].filter(Boolean).join(", ")}
            </span>
          )}

          <NewFolderButton prefix={prefix} onCreated={refresh} />
          <UploadButton prefix={prefix} onUploaded={refresh} />
        </div>
      </header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-[1100px] mx-auto w-full px-5 py-6">

        {(error || actionError) && (
          <div className="mb-5 flex items-center gap-2.5 px-4 py-3 rounded-xl
                          bg-error-bg border border-error-border text-[12px] text-error-text">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {actionError || error}
            <button
              onClick={() => { setActionError(null); if (error) refresh(); }}
              className="ml-auto underline hover:no-underline text-[11px]"
            >
              {actionError ? "Chiudi" : "Riprova"}
            </button>
          </div>
        )}

        {loading && !initialized && <SkeletonGrid />}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <svg className="w-10 h-10 text-text-muted/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p className="text-sm text-text-secondary">Cartella vuota.</p>
            <p className="text-xs text-text-muted mt-1">
              {prefix
                ? "Nessun file o sottocartella in questo percorso."
                : "GCS_BUCKET non configurato o bucket vuoto."}
            </p>
          </div>
        )}

        {hasItems && (
          <div className="space-y-6">

            {/* "Cartella superiore" — also a drop target */}
            {prefix && (
              <DropTarget onFileDrop={(src) => handleMove(src, parentPrefix ?? "")}>
                {(dragOver) => (
                  <button
                    onClick={back}
                    className={`flex items-center gap-1.5 text-[12px] transition-colors px-2 py-1 rounded-lg
                                ${dragOver
                                  ? "text-accent bg-accent/8"
                                  : "text-text-secondary hover:text-text-primary"}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Cartella superiore
                  </button>
                )}
              </DropTarget>
            )}

            {folders.length > 0 && (
              <section>
                <h2 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-3">
                  Cartelle
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {folders.map((folder) => (
                    <FolderCard
                      key={folder.prefix}
                      name={folder.name}
                      folderPrefix={folder.prefix}
                      onClick={() => navigate(folder.prefix)}
                      onFileDrop={handleMove}
                    />
                  ))}
                </div>
              </section>
            )}

            {files.length > 0 && (
              <section>
                <h2 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-3">
                  File
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {files.map((file) => (
                    <FileCard
                      key={file.fullPath}
                      file={file}
                      onClick={() => setSelectedFile(file)}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </section>
            )}

            {loading && initialized && (
              <div className="flex justify-center pt-2">
                <span className="w-4 h-4 rounded-full border-2 border-text-muted/30 border-t-accent animate-spin" />
              </div>
            )}
          </div>
        )}
      </main>

      {selectedFile && (
        <DocumentPanel
          doc={gcsFileToDoc(selectedFile)}
          onClose={() => setSelectedFile(null)}
        />
      )}
    </div>
  );
}
