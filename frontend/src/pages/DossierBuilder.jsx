import { useState, useRef, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useGcsBrowser } from "../hooks/useGcsBrowser";
import DocumentPanel from "../components/DocumentPanel";
import { apiFetch } from "../lib/apiFetch";

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

function FolderCard({ name, folderPrefix, onClick, onFileDrop, onRename, onDelete, onCopy }) {
  const [dragOver, setDragOver] = useState(false);
  const [mode,     setMode]     = useState("idle"); // idle | rename | confirmDelete
  const [newName,  setNewName]  = useState("");
  const renameRef               = useRef(null);

  const handleDragOver  = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const src = e.dataTransfer.getData("text/plain");
    if (src) onFileDrop?.(src, folderPrefix);
  };

  const openRename = (e) => {
    e.stopPropagation();
    setNewName(name); setMode("rename");
    setTimeout(() => { renameRef.current?.focus(); renameRef.current?.select(); }, 0);
  };
  const submitRename = () => {
    const n = newName.trim();
    if (n && n !== name) onRename?.(folderPrefix, n);
    setMode("idle");
  };
  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (mode === "confirmDelete") { onDelete?.(folderPrefix); setMode("idle"); }
    else setMode("confirmDelete");
  };

  if (mode === "rename") {
    return (
      <div className="rounded-xl border border-accent/40 bg-surface-raised px-4 py-3.5 flex items-center gap-3">
        <svg className="w-8 h-8 flex-shrink-0 text-amber-400/80" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
        </svg>
        <input
          ref={renameRef}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setMode("idle"); }}
          onBlur={submitRename}
          className="flex-1 text-[13px] bg-surface border border-border rounded-md px-2 py-1
                     text-text-primary focus:outline-none focus:border-accent/60"
        />
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseLeave={() => { if (mode === "confirmDelete") setMode("idle"); }}
      className={`rounded-xl border transition-colors duration-150 group
                  ${dragOver
                    ? "border-accent bg-accent/8 scale-[1.01]"
                    : "border-border hover:border-accent/40 bg-surface-raised"}`}
    >
      <div className="px-4 py-3.5 flex items-center gap-3">
        <svg className="w-8 h-8 flex-shrink-0 text-amber-400/80 group-hover:text-amber-400 transition-colors"
             fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
        </svg>
        <button onClick={onClick} className="flex-1 min-w-0 text-left">
          <span className="text-[13px] font-medium text-text-primary group-hover:text-accent transition-colors truncate block">
            {name}
          </span>
        </button>
        {/* Folder actions — visible on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={openRename} title="Rinomina"
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onCopy?.(folderPrefix); }} title="Duplica"
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button onClick={handleDeleteClick} title={mode === "confirmDelete" ? "Conferma eliminazione" : "Elimina"}
                  className={`p-1.5 rounded-lg transition-colors
                              ${mode === "confirmDelete"
                                ? "bg-red-500 text-white"
                                : "text-text-muted hover:text-red-400 hover:bg-red-500/10"}`}>
            {mode === "confirmDelete"
              ? <span className="text-[9px] font-bold px-0.5">OK?</span>
              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FileCard ──────────────────────────────────────────────────────────────────

function FileCard({ file, onClick, onDelete, onRename, onCopy, selectMode = false, isSelected = false }) {
  const [mode,   setMode]   = useState("idle"); // idle | rename | confirmDelete
  const [newName, setNewName] = useState("");
  const renameInputRef = useRef(null);

  const icon  = fileIconType(file.contentType);
  const color = FILE_ICON_COLORS[icon] || "text-text-secondary";

  const openRename = (e) => {
    e.stopPropagation();
    setNewName(file.name);
    setMode("rename");
    setTimeout(() => { renameInputRef.current?.focus(); renameInputRef.current?.select(); }, 0);
  };

  const submitRename = () => {
    const n = newName.trim();
    if (n && n !== file.name) onRename?.(file, n);
    setMode("idle");
  };

  const handleRenameKey = (e) => {
    if (e.key === "Enter")  submitRename();
    if (e.key === "Escape") setMode("idle");
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (mode === "confirmDelete") { onDelete?.(file); setMode("idle"); }
    else setMode("confirmDelete");
  };

  const handleCopy = (e) => { e.stopPropagation(); onCopy?.(file); };

  if (mode === "rename") {
    return (
      <div className="rounded-xl border border-accent/40 bg-surface-raised px-4 py-3.5 flex items-center gap-3">
        <svg className={`w-7 h-7 flex-shrink-0 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <input
          ref={renameInputRef}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleRenameKey}
          onBlur={submitRename}
          className="flex-1 min-w-0 text-[13px] bg-surface border border-border rounded-md px-2 py-1
                     text-text-primary focus:outline-none focus:border-accent/60"
        />
      </div>
    );
  }

  return (
    <div
      draggable={!selectMode}
      onDragStart={(e) => {
        if (selectMode) return;
        e.dataTransfer.setData("text/plain", file.fullPath);
        e.dataTransfer.effectAllowed = "move";
      }}
      onMouseLeave={() => { if (mode === "confirmDelete") setMode("idle"); }}
      className={`relative group rounded-xl border bg-surface-raised
                  transition-colors duration-150
                  ${selectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}
                  ${isSelected
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-accent/40"}`}
    >
      {/* Select checkbox */}
      {selectMode && (
        <div className="absolute top-2.5 left-2.5 z-10">
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
                           ${isSelected ? "bg-accent border-accent" : "border-border/60 bg-surface"}`}>
            {isSelected && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      )}
      <button
        onClick={onClick}
        className={`text-left w-full py-3.5 flex items-start gap-3
                    ${selectMode ? "pl-9 pr-4" : "pl-4 pr-24"}`}
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

      {/* Action buttons — visible on hover, hidden in select mode */}
      <div className={`absolute top-2 right-2 flex items-center gap-0.5 transition-opacity duration-150
                       ${selectMode ? "hidden" : "opacity-0 group-hover:opacity-100"}`}>
        {/* Rename */}
        <button onClick={openRename} title="Rinomina"
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        {/* Copy */}
        <button onClick={handleCopy} title="Duplica"
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
        {/* Delete */}
        <button onClick={handleDeleteClick} title={mode === "confirmDelete" ? "Conferma eliminazione" : "Elimina"}
                className={`p-1.5 rounded-lg transition-colors
                            ${mode === "confirmDelete"
                              ? "bg-red-500 text-white"
                              : "text-text-muted hover:text-red-400 hover:bg-red-500/10"}`}>
          {mode === "confirmDelete"
            ? <span className="text-[9px] font-bold px-0.5">OK?</span>
            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
          }
        </button>
      </div>
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
        const res = await apiFetch("/api/storage/upload", { method: "POST", body: fd });
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
    <div className="space-y-1">
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
      {uploadErr && (
        <p className="text-[11px] text-red-400 leading-snug">{uploadErr}</p>
      )}
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
      const res = await apiFetch("/api/storage/upload", { method: "POST", body: fd });
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

  // ── Select mode ────────────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selected,   setSelected]   = useState(new Set()); // Set<fullPath>

  const toggleSelected = useCallback((fullPath) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(fullPath) ? next.delete(fullPath) : next.add(fullPath);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const handleBatchDelete = useCallback(async () => {
    setActionError(null);
    let failed = 0;
    for (const path of selected) {
      try {
        const res = await fetch(`/api/storage/file?name=${encodeURIComponent(path)}`, { method: "DELETE" });
        if (!res.ok) failed++;
      } catch { failed++; }
    }
    exitSelectMode();
    refresh();
    if (failed) setActionError(`${failed} file non eliminati.`);
  }, [selected, exitSelectMode, refresh]);

  const handleBatchMove = useCallback(async (targetPrefix) => {
    setActionError(null);
    let failed = 0;
    for (const path of selected) {
      const filename    = path.split("/").pop();
      const destination = `${targetPrefix}${filename}`;
      if (path === destination) continue;
      try {
        const res = await apiFetch("/api/storage/move", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ source: path, destination }),
        });
        if (!res.ok) failed++;
      } catch { failed++; }
    }
    exitSelectMode();
    refresh();
    if (failed) setActionError(`${failed} file non spostati.`);
  }, [selected, exitSelectMode, refresh]);

  // ── Sort ───────────────────────────────────────────────────────────────────
  const [sortField, setSortField] = useState("name"); // name | date | size
  const [sortDir,   setSortDir]   = useState("asc");

  const sortedFiles = useMemo(() => {
    const arr = [...files];
    arr.sort((a, b) => {
      let va, vb;
      if (sortField === "date") {
        va = a.updated ?? ""; vb = b.updated ?? "";
      } else if (sortField === "size") {
        va = a.size ?? 0; vb = b.size ?? 0;
        return sortDir === "asc" ? va - vb : vb - va;
      } else {
        va = (a.name ?? "").toLowerCase(); vb = (b.name ?? "").toLowerCase();
      }
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return arr;
  }, [files, sortField, sortDir]);

  const cycleSort = useCallback((field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }, [sortField]);

  // Compute parent prefix for "Cartella superiore" drop target
  const parentPrefix = prefix
    ? prefix.slice(0, prefix.slice(0, -1).lastIndexOf("/") + 1)
    : null;

  const handleRename = useCallback(async (file, newName) => {
    setActionError(null);
    try {
      const res = await apiFetch("/api/storage/rename", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ source: file.fullPath, newName }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refresh();
    } catch (e) {
      setActionError(`Impossibile rinominare "${file.name}": ${e.message}`);
    }
  }, [refresh]);

  const handleCopy = useCallback(async (file) => {
    setActionError(null);
    try {
      const res = await apiFetch("/api/storage/copy", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ source: file.fullPath }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refresh();
    } catch (e) {
      setActionError(`Impossibile duplicare "${file.name}": ${e.message}`);
    }
  }, [refresh]);

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

  const handleFolderRename = useCallback(async (folderPrefix, newName) => {
    setActionError(null);
    try {
      const res = await apiFetch("/api/storage/rename-folder", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: folderPrefix, newName }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refresh();
    } catch (e) {
      setActionError(`Impossibile rinominare la cartella: ${e.message}`);
    }
  }, [refresh]);

  const handleFolderCopy = useCallback(async (folderPrefix) => {
    setActionError(null);
    try {
      const res = await apiFetch("/api/storage/copy-folder", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: folderPrefix }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refresh();
    } catch (e) {
      setActionError(`Impossibile duplicare la cartella: ${e.message}`);
    }
  }, [refresh]);

  const handleFolderDelete = useCallback(async (folderPrefix) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/storage/folder?prefix=${encodeURIComponent(folderPrefix)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refresh();
    } catch (e) {
      setActionError(`Impossibile eliminare la cartella: ${e.message}`);
    }
  }, [refresh]);

  const handleMove = useCallback(async (srcPath, targetPrefix) => {
    const filename    = srcPath.split("/").pop();
    const destination = `${targetPrefix}${filename}`;
    if (srcPath === destination) return;
    setActionError(null);
    try {
      const res = await apiFetch("/api/storage/move", {
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

          {files.length > 0 && (
            <button
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              className={`px-3 py-1.5 rounded-lg text-[12px] border transition-colors flex-shrink-0
                          ${selectMode
                            ? "border-accent/50 bg-accent/10 text-accent"
                            : "border-border text-text-secondary hover:text-text-primary hover:border-accent/40"}`}
            >
              {selectMode ? `${selected.size} selezionati` : "Seleziona"}
            </button>
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
                      onRename={handleFolderRename}
                      onDelete={handleFolderDelete}
                      onCopy={handleFolderCopy}
                    />
                  ))}
                </div>
              </section>
            )}

            {files.length > 0 && (
              <section>
                {/* Section header with sort controls */}
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-[10px] font-medium text-text-muted uppercase tracking-wider flex-1">
                    File
                  </h2>
                  {[
                    { field: "name", label: "Nome" },
                    { field: "date", label: "Data" },
                    { field: "size", label: "Dim." },
                  ].map(({ field, label }) => (
                    <button key={field} onClick={() => cycleSort(field)}
                            className={`text-[10px] flex items-center gap-0.5 transition-colors
                                        ${sortField === field ? "text-accent" : "text-text-muted hover:text-text-secondary"}`}>
                      {label}
                      {sortField === field && (
                        <svg className={`w-2.5 h-2.5 transition-transform ${sortDir === "desc" ? "rotate-180" : ""}`}
                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sortedFiles.map((file) => (
                    <FileCard
                      key={file.fullPath}
                      file={file}
                      selectMode={selectMode}
                      isSelected={selected.has(file.fullPath)}
                      onClick={() => selectMode ? toggleSelected(file.fullPath) : setSelectedFile(file)}
                      onDelete={handleDelete}
                      onRename={handleRename}
                      onCopy={handleCopy}
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

      {/* Batch action bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50
                        flex items-center gap-2 px-4 py-2.5 rounded-2xl
                        bg-surface-raised border border-border/70 shadow-2xl
                        animate-slide-up print:hidden">
          <span className="text-[12px] font-medium text-text-primary pr-1">
            {selected.size} {selected.size === 1 ? "file" : "file"} selezionati
          </span>
          <span className="w-px h-4 bg-border/60 mx-1" />

          {/* Move to folder */}
          {folders.length > 0 && (
            <div className="relative group/move">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px]
                                 border border-border text-text-secondary hover:text-text-primary
                                 hover:border-accent/40 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Sposta in…
              </button>
              <div className="absolute bottom-full mb-1.5 left-0 hidden group-hover/move:block
                              bg-surface-raised border border-border rounded-xl shadow-xl overflow-hidden min-w-[160px]">
                {prefix && (
                  <button onClick={() => handleBatchMove(parentPrefix ?? "")}
                          className="w-full text-left px-3 py-2 text-[12px] text-text-secondary
                                     hover:bg-surface hover:text-text-primary transition-colors flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Cartella superiore
                  </button>
                )}
                {folders.map(f => (
                  <button key={f.prefix} onClick={() => handleBatchMove(f.prefix)}
                          className="w-full text-left px-3 py-2 text-[12px] text-text-secondary
                                     hover:bg-surface hover:text-text-primary transition-colors flex items-center gap-2 border-t border-border/30">
                    <svg className="w-3.5 h-3.5 text-amber-400/70" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                    </svg>
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Delete selected */}
          <button onClick={handleBatchDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px]
                             border border-red-500/30 text-red-400 hover:bg-red-500/10
                             transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Elimina
          </button>

          <button onClick={exitSelectMode}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors ml-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
