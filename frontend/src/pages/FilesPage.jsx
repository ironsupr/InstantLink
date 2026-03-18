import { useState, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getFiles, uploadFile, deleteFile, moveFile,
  getFolders, createFolder, deleteFolder,
} from "../lib/api";
import {
  Search, Upload, Loader2, Grid, List, LayoutGrid, Clock,
  FileText, Image as ImageIcon, File as FileIcon, X, SortAsc,
  FolderPlus, Folder as FolderIcon, FolderOpen, Hash,
  ChevronRight, Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import FileCard from "../components/FileCard";
import FileDetailsSidebar from "../components/FileDetailsSidebar";
import useAuthUser from "../hooks/useAuthUser";
import { formatFileSize } from "../lib/utils";

/* ─── Constants ─────────────────────────────────── */
const FILE_CATEGORIES = [
  { id: "all",      label: "All Files",  icon: LayoutGrid },
  { id: "recent",   label: "Recent",     icon: Clock      },
  { id: "image",    label: "Images",     icon: ImageIcon  },
  { id: "document", label: "Documents",  icon: FileText   },
  { id: "other",    label: "Other",      icon: FileIcon   },
];

const SORT_OPTIONS = [
  { id: "date_desc", label: "Newest first"   },
  { id: "date_asc",  label: "Oldest first"   },
  { id: "name_asc",  label: "Name A–Z"       },
  { id: "name_desc", label: "Name Z–A"       },
  { id: "size_desc", label: "Largest first"  },
  { id: "size_asc",  label: "Smallest first" },
];

const RECENT_MS   = 7 * 24 * 60 * 60 * 1000;
const MAX_FILE_MB = 10;

/* ─── Helpers ───────────────────────────────────── */
const catCount = (id, files) => {
  if (id === "all")      return files.length;
  if (id === "recent")   return files.filter(f => Date.now() - new Date(f.createdAt).getTime() < RECENT_MS).length;
  if (id === "image")    return files.filter(f => f.type === "image").length;
  if (id === "document") return files.filter(f => f.type === "document").length;
  return files.filter(f => f.type !== "image" && f.type !== "document").length;
};

const detectType = (file) => {
  if (file.type.startsWith("image/")) return "image";
  if (
    file.type === "application/pdf" ||
    file.type.includes("document")  ||
    file.type.includes("sheet")     ||
    file.type.includes("presentation")
  ) return "document";
  return "other";
};

/* ─── Sub-components ────────────────────────────── */
const SectionLabel = ({ children, action }) => (
  <div className="flex items-center justify-between px-3 pt-4 pb-1">
    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-base-content/45">{children}</span>
    {action}
  </div>
);

const CreateFolderModal = ({ onConfirm, onCancel }) => {
  const [name, setName] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-base-content/30 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-80 rounded-3xl border border-base-300/70 bg-base-100 p-6 shadow-2xl flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/12 text-primary flex items-center justify-center">
            <FolderPlus className="size-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base-content text-sm">New Folder</h3>
            <p className="text-xs text-base-content/50">Give your folder a name</p>
          </div>
        </div>
        <input
          autoFocus
          type="text"
          placeholder="e.g. Design Assets"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && name.trim()) onConfirm(name.trim());
            if (e.key === "Escape") onCancel();
          }}
          className="w-full rounded-xl border border-base-300/80 bg-base-100/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/40 transition"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-base-content/70 hover:bg-base-200 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-primary-content rounded-lg font-semibold transition"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════ */
const FilesPage = () => {
  const queryClient  = useQueryClient();
  const fileInputRef = useRef(null);
  const { authUser } = useAuthUser();

  /* ── View state ── */
  const [activeView,     setActiveView]     = useState("category"); // "category" | "folder" | "channel"
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [activeChannel,  setActiveChannel]  = useState(null);
  const [search,         setSearch]         = useState("");
  const [selectedFile,   setSelectedFile]   = useState(null);
  const [viewMode,       setViewMode]       = useState("grid");
  const [sortBy,         setSortBy]         = useState("date_desc");

  /* ── Folder UI state ── */
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);

  /* ── Drop zone state ── */
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const dropEnterCount  = useRef(0);

  /* ── Queries ── */
  const { data: files   = [], isLoading: filesLoading   } = useQuery({ queryKey: ["files"],   queryFn: getFiles   });
  const { data: folders = [], isLoading: foldersLoading } = useQuery({ queryKey: ["folders"], queryFn: getFolders });

  /* ── Mutations ── */
  const { mutate: upload, isPending: isUploading } = useMutation({
    mutationFn: uploadFile,
    onSuccess: () => {
      toast.success("File uploaded!");
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Upload failed"),
  });

  const { mutate: removeFile } = useMutation({
    mutationFn: deleteFile,
    onSuccess: (_, id) => {
      toast.success("File deleted");
      if (selectedFile?._id === id) setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
  });

  const { mutate: move } = useMutation({
    mutationFn: moveFile,
    onSuccess: () => {
      toast.success("File moved");
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: () => toast.error("Move failed"),
  });

  const { mutate: addFolder } = useMutation({
    mutationFn: createFolder,
    onSuccess: (folder) => {
      toast.success(`Folder "${folder.name}" created`);
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      setShowCreateFolder(false);
    },
    onError: (err) => toast.error(err.response?.data?.message || "Failed to create folder"),
  });

  const { mutate: removeFolder } = useMutation({
    mutationFn: deleteFolder,
    onSuccess: () => {
      toast.success("Folder deleted");
      if (activeView === "folder") { setActiveView("category"); setActiveFolderId(null); }
      queryClient.invalidateQueries({ queryKey: ["folders", "files"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  /* ── File processing ── */
  const processFile = useCallback((rawFile) => {
    if (rawFile.size > MAX_FILE_MB * 1024 * 1024)
      return toast.error(`File size must be under ${MAX_FILE_MB} MB`);
    const reader = new FileReader();
    reader.onload = (ev) =>
      upload({ name: rawFile.name, type: detectType(rawFile), fileBase64: ev.target.result });
    reader.readAsDataURL(rawFile);
  }, [upload]);

  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    processFile(file);
  };

  /* ── Drag-from-desktop drop zone ── */
  const handlePageDragEnter = (e) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dropEnterCount.current++;
    setDropZoneActive(true);
  };
  const handlePageDragLeave = (e) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    dropEnterCount.current = Math.max(0, dropEnterCount.current - 1);
    if (dropEnterCount.current === 0) setDropZoneActive(false);
  };
  const handlePageDragOver = (e) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const handlePageDrop = (e) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dropEnterCount.current = 0;
    setDropZoneActive(false);
    Array.from(e.dataTransfer.files).forEach(processFile);
  };

  /* ── Folder drag-drop (file card → folder) ── */
  const handleFolderDragOver = (e, folderId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolderId(folderId);
  };
  const handleFolderDragLeave = () => setDragOverFolderId(null);
  const handleFolderDrop = (e, folderId) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const fileId = e.dataTransfer.getData("fileId");
    if (fileId) move({ fileId, folderId });
  };

  /* ── Channels from files ── */
  const channels = useMemo(() => {
    const seen = new Set();
    return files.filter(f => f.channel).map(f => f.channel)
      .filter(ch => { if (seen.has(ch)) return false; seen.add(ch); return true; });
  }, [files]);

  const totalSize     = useMemo(() => files.reduce((s, f) => s + (f.size || 0), 0), [files]);
  const activeFolder  = folders.find(f => f._id === activeFolderId);
  const folderFileCount = (fid) => files.filter(f => (f.folder?.toString?.() || f.folder) === fid).length;

  /* ── Filtered + sorted files ── */
  const filteredFiles = useMemo(() => {
    let list = [...files];

    if (activeView === "folder") {
      list = list.filter(f => (f.folder?.toString?.() || f.folder) === activeFolderId);
    } else if (activeView === "channel") {
      list = list.filter(f => f.channel === activeChannel);
    } else {
      if      (activeCategory === "recent")   list = list.filter(f => Date.now() - new Date(f.createdAt).getTime() < RECENT_MS);
      else if (activeCategory === "other")    list = list.filter(f => f.type !== "image" && f.type !== "document");
      else if (activeCategory !== "all")      list = list.filter(f => f.type === activeCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case "date_asc":  return new Date(a.createdAt) - new Date(b.createdAt);
        case "name_asc":  return a.name.localeCompare(b.name);
        case "name_desc": return b.name.localeCompare(a.name);
        case "size_desc": return (b.size || 0) - (a.size || 0);
        case "size_asc":  return (a.size || 0) - (b.size || 0);
        default:          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });
    return list;
  }, [files, activeView, activeCategory, activeFolderId, activeChannel, search, sortBy]);

  const contentTitle = activeView === "folder"
    ? (activeFolder?.name ?? "Folder")
    : activeView === "channel"
    ? `# ${activeChannel}`
    : FILE_CATEGORIES.find(c => c.id === activeCategory)?.label ?? "All Files";

  return (
    <div
      className="flex h-full overflow-hidden relative bg-gradient-to-b from-base-200/45 via-base-100 to-base-200/35"
      onDragEnter={handlePageDragEnter}
      onDragLeave={handlePageDragLeave}
      onDragOver={handlePageDragOver}
      onDrop={handlePageDrop}
    >
      {/* ════ DESKTOP FILE DROP OVERLAY ════ */}
      {dropZoneActive && (
        <div className="absolute inset-0 z-50 border-4 border-dashed border-primary/45 bg-primary/10 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="rounded-3xl border border-base-300/70 bg-base-100 p-6 shadow-xl flex flex-col items-center gap-3">
            <Upload className="size-10 text-primary" />
            <p className="text-lg font-bold text-base-content">Drop files to upload</p>
            <p className="text-sm text-base-content/55">Max {MAX_FILE_MB} MB per file</p>
          </div>
        </div>
      )}

      {/* ════ CREATE FOLDER MODAL ════ */}
      {showCreateFolder && (
        <CreateFolderModal
          onConfirm={(name) => addFolder(name)}
          onCancel={() => setShowCreateFolder(false)}
        />
      )}

      {/* ════════════════════════
          LEFT SIDEBAR
      ════════════════════════ */}
      <aside className="w-56 shrink-0 border-r border-base-300/70 bg-base-100/70 backdrop-blur-sm flex flex-col py-3 overflow-y-auto">
        <p className="px-3 pt-2 pb-2 text-[10px] font-bold text-base-content/45 uppercase tracking-[0.16em]">
          File Center
        </p>

        {/* Browse (categories) */}
        <SectionLabel>Browse</SectionLabel>
        {FILE_CATEGORIES.map(({ id, label, icon: Icon }) => {
          const count  = catCount(id, files);
          const active = activeView === "category" && activeCategory === id;
          return (
            <button
              key={id}
              onClick={() => { setActiveView("category"); setActiveCategory(id); setSearch(""); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-all ${
                active ? "bg-primary/12 text-primary" : "text-base-content/70 hover:bg-base-200/75 hover:text-base-content"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="size-4 opacity-70" />
                {label}
              </span>
              {count > 0 && (
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                  active ? "bg-primary/15 text-primary" : "bg-base-200 text-base-content/55"
                }`}>{count}</span>
              )}
            </button>
          );
        })}

        {/* Folders */}
        <SectionLabel
          action={
            <button
              onClick={() => setShowCreateFolder(true)}
              title="New folder"
              className="p-1 rounded hover:bg-base-200 text-base-content/45 hover:text-primary transition"
            >
              <FolderPlus className="size-3.5" />
            </button>
          }
        >
          Folders
        </SectionLabel>

        {foldersLoading ? (
          <div className="px-4 py-2"><Loader2 className="size-4 animate-spin text-base-content/35" /></div>
        ) : folders.length === 0 ? (
          <button
            onClick={() => setShowCreateFolder(true)}
            className="mx-3 my-1 py-2 px-2 text-xs text-base-content/50 border border-dashed border-base-300 rounded-lg hover:border-primary/45 hover:text-primary transition text-center"
          >
            + Create a folder
          </button>
        ) : (
          folders.map((folder) => {
            const isActive   = activeView === "folder" && activeFolderId === folder._id;
            const isDragOver = dragOverFolderId === folder._id;
            const count      = folderFileCount(folder._id);
            return (
              <div
                key={folder._id}
                className="group relative"
                onDragOver={(e) => handleFolderDragOver(e, folder._id)}
                onDragLeave={handleFolderDragLeave}
                onDrop={(e) => handleFolderDrop(e, folder._id)}
              >
                <button
                  onClick={() => { setActiveView("folder"); setActiveFolderId(folder._id); setSearch(""); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all ${
                    isDragOver
                      ? "bg-primary/20 text-primary scale-[0.98]"
                      : isActive
                      ? "bg-primary/12 text-primary"
                      : "text-base-content/70 hover:bg-base-200/75 hover:text-base-content"
                  }`}
                >
                  {isActive
                    ? <FolderOpen className="size-4 text-primary shrink-0" />
                    : <FolderIcon className="size-4 opacity-60 shrink-0" />}
                  <span className="truncate flex-1 text-left">{folder.name}</span>
                  {count > 0 && (
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center shrink-0 ${
                      isActive ? "bg-primary/15 text-primary" : "bg-base-200 text-base-content/55"
                    }`}>{count}</span>
                  )}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete folder "${folder.name}"?\nFiles inside will NOT be deleted.`))
                      removeFolder(folder._id);
                  }}
                  title="Delete folder"
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-error/10 text-base-content/30 hover:text-error transition"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            );
          })
        )}

        {/* By Channel */}
        {channels.length > 0 && (
          <>
            <SectionLabel>By Channel</SectionLabel>
            {channels.map((ch) => {
              const count  = files.filter(f => f.channel === ch).length;
              const active = activeView === "channel" && activeChannel === ch;
              return (
                <button
                  key={ch}
                  onClick={() => { setActiveView("channel"); setActiveChannel(ch); setSearch(""); }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-all ${
                    active ? "bg-primary/12 text-primary" : "text-base-content/70 hover:bg-base-200/75 hover:text-base-content"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Hash className="size-3.5 opacity-60 shrink-0" />
                    <span className="truncate">{ch}</span>
                  </span>
                  {count > 0 && (
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center shrink-0 ${
                      active ? "bg-primary/15 text-primary" : "bg-base-200 text-base-content/55"
                    }`}>{count}</span>
                  )}
                </button>
              );
            })}
          </>
        )}

        {/* Storage */}
        <div className="mt-auto pt-4 mx-3 border-t border-base-300/70">
          <p className="text-[10px] font-bold text-base-content/45 uppercase tracking-[0.16em] mb-2">Storage</p>
          <p className="text-sm font-bold text-base-content">{formatFileSize(totalSize)}</p>
          <p className="text-xs text-base-content/55 mt-0.5">{files.length} files · {folders.length} folders</p>
          <div className="mt-3 h-1.5 bg-base-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min(100, (totalSize / (500 * 1024 * 1024)) * 100).toFixed(1)}%` }}
            />
          </div>
          <p className="text-[10px] text-base-content/45 mt-1">of 500 MB</p>
        </div>
        <div className="h-4" />
      </aside>

      {/* ════════════════════════
          MAIN CONTENT
      ════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Toolbar */}
        <header className="border-b border-base-300/70 bg-base-100/80 backdrop-blur-sm px-6 py-3 flex items-center gap-3 sticky top-0 z-20 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-base-content/45 mb-0.5">
              <span>File Center</span>
              {activeView !== "category" && (
                <>
                  <ChevronRight className="size-3" />
                  <span>{activeView === "folder" ? "Folders" : "By Channel"}</span>
                </>
              )}
            </div>
            <h1 className="text-base font-bold text-base-content leading-none flex items-center gap-2">
              {activeView === "folder"  && <FolderOpen className="size-4 text-primary" />}
              {activeView === "channel" && <Hash className="size-4 text-base-content/60" />}
              {contentTitle}
            </h1>
            <p className="text-xs text-base-content/50 mt-0.5">
              {filteredFiles.length} {filteredFiles.length === 1 ? "file" : "files"}
              {search ? ` matching "${search}"` : ""}
              {activeView === "folder" && " · drag a file card onto a folder to move it"}
            </p>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-base-content/45" />
            <input
              type="text"
              placeholder="Search files…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-base-300/80 bg-base-100/70 py-2 pl-9 pr-8 text-sm outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/40 transition"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/45 hover:text-base-content"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="relative flex items-center">
            <SortAsc className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-base-content/45 pointer-events-none" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="rounded-xl border border-base-300/80 py-2 pl-8 pr-3 text-sm text-base-content bg-base-100 outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/40 cursor-pointer appearance-none"
            >
              {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-0.5 border border-base-300/80 rounded-xl p-1 bg-base-100/80">
            <button onClick={() => setViewMode("grid")} title="Grid view"
              className={`p-1.5 rounded-lg ${viewMode === "grid" ? "bg-primary/12 text-primary" : "text-base-content/45 hover:bg-base-200"}`}>
              <Grid className="size-3.5" />
            </button>
            <button onClick={() => setViewMode("list")} title="List view"
              className={`p-1.5 rounded-lg ${viewMode === "list" ? "bg-primary/12 text-primary" : "text-base-content/45 hover:bg-base-200"}`}>
              <List className="size-3.5" />
            </button>
          </div>

          {/* New Folder */}
          <button
            onClick={() => setShowCreateFolder(true)}
            className="flex items-center gap-2 px-3 py-2 border border-base-300/80 hover:border-base-300 bg-base-100 hover:bg-base-200/70 text-base-content rounded-xl text-sm font-medium transition whitespace-nowrap"
          >
            <FolderPlus className="size-3.5 text-base-content/60" />
            New Folder
          </button>

          {/* Upload */}
          <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileInputChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-primary-content rounded-xl text-sm font-semibold shadow-sm shadow-primary/20 transition whitespace-nowrap"
          >
            {isUploading ? <Loader2 className="animate-spin size-3.5" /> : <Upload className="size-3.5" />}
            Upload
          </button>
        </header>

        {/* Drag hint */}
        {folders.length > 0 && (
          <div className="bg-warning/10 border-b border-warning/20 px-6 py-1.5 flex items-center gap-2 text-xs text-warning">
            <FolderIcon className="size-3.5 shrink-0" />
            Tip: drag any file card onto a folder in the sidebar to move it · drop files from your desktop anywhere to upload
          </div>
        )}

        {/* File grid / list */}
        <main className="flex-1 overflow-y-auto p-6">
          {filesLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 opacity-70">
              <Loader2 className="size-7 animate-spin text-primary" />
              <p className="text-sm font-medium text-base-content/55">Loading files…</p>
            </div>

          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-base-200 flex items-center justify-center">
                {activeView === "folder"
                  ? <FolderOpen className="size-7 text-base-content/30" />
                  : <FileIcon className="size-7 text-base-content/30" />}
              </div>
              <div>
                <p className="font-semibold text-base-content/65">
                  {activeView === "folder" ? "Folder is empty" : "No files found"}
                </p>
                <p className="text-sm text-base-content/45 mt-1">
                  {activeView === "folder"
                    ? "Drag file cards onto this folder in the sidebar to move them here"
                    : search
                    ? `No results for "${search}"`
                    : "Upload a file or drop it anywhere on this page"}
                </p>
              </div>
              {activeView === "category" && !search && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-content rounded-xl text-sm font-semibold hover:bg-primary/90 transition"
                >
                  <Upload className="size-4" /> Upload a file
                </button>
              )}
            </div>

          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredFiles.map(file => (
                <FileCard
                  key={file._id}
                  file={file}
                  onSelect={setSelectedFile}
                  isSelected={selectedFile?._id === file._id}
                  viewMode="grid"
                  onDelete={(id) => removeFile(id)}
                />
              ))}
            </div>

          ) : (
            <div className="rounded-2xl border border-base-300/80 bg-base-100/90 overflow-hidden shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-300/70 bg-base-200/45">
                    <th className="w-10 px-4 py-3" />
                    <th className="text-left px-4 py-3 text-xs font-semibold text-base-content/45 uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-base-content/45 uppercase tracking-wide hidden md:table-cell">Uploaded by</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-base-content/45 uppercase tracking-wide hidden sm:table-cell">Size</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-base-content/45 uppercase tracking-wide hidden lg:table-cell">Date</th>
                    <th className="w-20 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-300/55">
                  {filteredFiles.map(file => (
                    <FileCard
                      key={file._id}
                      file={file}
                      onSelect={setSelectedFile}
                      isSelected={selectedFile?._id === file._id}
                      viewMode="list"
                      onDelete={(id) => removeFile(id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* Details Sidebar */}
      {selectedFile && (
        <FileDetailsSidebar
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
          onDelete={() => {
            if (window.confirm(`Delete "${selectedFile.name}"?`)) {
              removeFile(selectedFile._id);
            }
          }}
        />
      )}
    </div>
  );
};

export default FilesPage;
