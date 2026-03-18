import { useState, useEffect, useRef } from "react";
import { FileText, Image, FileCode, FileSpreadsheet, FileIcon, Download, Eye, Trash2, MoreVertical } from "lucide-react";
import { formatFileSize } from "../lib/utils";
import Avatar from "./Avatar";

/* ── File type helpers ──────────────────────────── */
const ICON_MAP = {
  image:       { icon: Image,           bg: "bg-success/10",   color: "text-success"   },
  document:    { icon: FileText,        bg: "bg-primary/10",   color: "text-primary"   },
  spreadsheet: { icon: FileSpreadsheet, bg: "bg-success/10",   color: "text-success"   },
  code:        { icon: FileCode,        bg: "bg-secondary/12", color: "text-secondary" },
};
const DEFAULT_ICON = { icon: FileIcon, bg: "bg-base-200", color: "text-base-content/45" };

const getIconConfig = (type) => ICON_MAP[type] || DEFAULT_ICON;

const relativeTime = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  <  1) return "just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  <  7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
};

/* ── Component ──────────────────────────────────── */
const FileCard = ({ file, onSelect, isSelected, viewMode = "grid", onDelete, onDragStart, onDragEnd }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const menuRef = useRef(null);
  const { icon: Icon, bg, color } = getIconConfig(file.type);

  const handleDragStart = (e) => {
    e.dataTransfer.setData("fileId", file._id);
    e.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
    onDragStart?.(file);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEnd?.(file);
  };

  // Close menu when clicking anywhere outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleDownload = (e) => {
    e.stopPropagation();
    const a = document.createElement("a");
    a.href = file.url;
    a.download = file.name;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.click();
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (window.confirm(`Delete "${file.name}"?`)) onDelete?.(file._id);
  };

  const handleView = (e) => {
    e.stopPropagation();
    window.open(file.url, "_blank", "noreferrer");
  };

  /* ── LIST ROW ─────────────────────────────────── */
  if (viewMode === "list") {
    return (
      <tr
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={() => onSelect(file)}
        className={`group cursor-pointer transition-colors ${
          isDragging ? "opacity-50" : isSelected ? "bg-primary/8" : "hover:bg-base-200/45"
        }`}
      >
        {/* Type icon */}
        <td className="px-4 py-3 w-10">
          <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
            <Icon className={`size-4 ${color}`} />
          </div>
        </td>

        {/* Name */}
        <td className="px-4 py-3">
          <p className="font-medium text-base-content truncate max-w-[240px]">{file.name}</p>
          <p className="text-xs text-base-content/45 uppercase mt-0.5">{file.type}</p>
        </td>

        {/* Uploader */}
        <td className="px-4 py-3 hidden md:table-cell">
          {file.sharedBy ? (
            <div className="flex items-center gap-2">
              <Avatar src={file.sharedBy.profilePic} name={file.sharedBy.fullName} size="w-6 h-6" />
              <span className="text-sm text-base-content/80 truncate max-w-[120px]">{file.sharedBy.fullName}</span>
            </div>
          ) : (
            <span className="text-sm text-base-content/40">—</span>
          )}
        </td>

        {/* Size */}
        <td className="px-4 py-3 text-sm text-base-content/60 hidden sm:table-cell whitespace-nowrap">
          {formatFileSize(file.size)}
        </td>

        {/* Date */}
        <td className="px-4 py-3 text-sm text-base-content/45 hidden lg:table-cell whitespace-nowrap">
          {relativeTime(file.createdAt)}
        </td>

        {/* Actions */}
        <td className="px-4 py-3 w-20">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleView}
              title="View file"
              className="p-1.5 rounded hover:bg-primary/10 text-base-content/45 hover:text-primary transition-colors"
            >
              <Eye className="size-3.5" />
            </button>
            <button
              onClick={handleDownload}
              title="Download"
              className="p-1.5 rounded hover:bg-primary/10 text-base-content/45 hover:text-primary transition-colors"
            >
              <Download className="size-3.5" />
            </button>
            {onDelete && (
              <button
                onClick={handleDelete}
                title="Delete"
                className="p-1.5 rounded hover:bg-error/10 text-base-content/45 hover:text-error transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  /* ── GRID CARD ────────────────────────────────── */
  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => onSelect(file)}
      className={`group relative rounded-2xl border bg-base-100/92 shadow-[0_8px_22px_rgba(15,23,42,0.05)] transition-all cursor-pointer ${
        isDragging
          ? "opacity-50 scale-95"
          : isSelected
          ? "border-primary/45 ring-2 ring-primary/15 shadow-md"
          : "border-base-300/75 hover:border-base-300 hover:shadow-lg"
      }`}
    >
      {/* Preview area — overflow-hidden here clips the image to the rounded top corners */}
      <div
        className="aspect-video w-full rounded-t-2xl bg-base-200/70 flex items-center justify-center relative overflow-hidden bg-center bg-cover"
        style={file.type === "image" ? { backgroundImage: `url(${file.url})` } : {}}
      >
        {file.type !== "image" && (
          <div className={`p-4 rounded-2xl ${bg}`}>
            <Icon className={`size-7 ${color}`} />
          </div>
        )}

        {/* Hover action overlay */}
        <div className="absolute inset-0 bg-base-content/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={handleView}
            title="View"
            className="p-2 rounded-lg shadow bg-base-100/95 hover:bg-base-100 text-base-content transition"
          >
            <Eye className="size-4" />
          </button>
          <button
            onClick={handleDownload}
            title="Download"
            className="p-2 rounded-lg shadow bg-base-100/95 hover:bg-base-100 text-base-content transition"
          >
            <Download className="size-4" />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm text-base-content truncate leading-tight">{file.name}</p>
            <p className="text-[11px] text-base-content/45 mt-0.5 uppercase font-medium">
              {formatFileSize(file.size)} · {file.type}
            </p>
          </div>
          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
              className="p-1 hover:bg-base-200 rounded text-base-content/45 hover:text-base-content"
            >
              <MoreVertical className="size-3.5" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 bg-base-100 border border-base-300/80 rounded-xl shadow-lg z-50 py-1 min-w-[130px]"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={handleView}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-base-content hover:bg-base-200/65 transition"
                >
                  <Eye className="size-3.5" /> View
                </button>
                <button
                  onClick={handleDownload}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-base-content hover:bg-base-200/65 transition"
                >
                  <Download className="size-3.5" /> Download
                </button>
                {onDelete && (
                  <>
                    <div className="my-1 border-t border-base-300/70" />
                    <button
                      onClick={handleDelete}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/10 transition"
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Uploader */}
        {file.sharedBy && (
          <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-base-300/60">
            <Avatar src={file.sharedBy.profilePic} name={file.sharedBy.fullName} size="w-4 h-4" />
            <span className="text-[11px] text-base-content/45 truncate">{file.sharedBy.fullName}</span>
            <span className="text-[11px] text-base-content/35 ml-auto shrink-0">{relativeTime(file.createdAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileCard;

