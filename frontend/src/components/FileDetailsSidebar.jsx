import { X, FileText, Image, FileSpreadsheet, FileIcon, Eye, Download, Share2, Info, Trash2, Copy, Check } from "lucide-react";
import { useState } from "react";
import ActivityTimeline from "./ActivityTimeline";
import Avatar from "./Avatar";
import { formatFileSize } from "../lib/utils";

const TYPE_CONFIG = {
  image:    { icon: Image,          bg: "bg-emerald-50", color: "text-emerald-500" },
  document: { icon: FileText,       bg: "bg-blue-50",    color: "text-blue-500"    },
  spreadsheet: { icon: FileSpreadsheet, bg: "bg-green-50", color: "text-green-600" },
};
const DEFAULT_TYPE = { icon: FileIcon, bg: "bg-gray-50", color: "text-gray-400" };

const fmt = (dateStr, opts) =>
  new Date(dateStr).toLocaleString([], opts ?? { dateStyle: "medium", timeStyle: "short" });

const FileDetailsSidebar = ({ file, onClose, onDelete }) => {
    const [copied, setCopied] = useState(false);
    if (!file) return null;

    const { icon: Icon, bg, color } = TYPE_CONFIG[file.type] || DEFAULT_TYPE;

    /* Real activity from actual file timestamps */
    const activities = [
        ...(file.updatedAt && file.updatedAt !== file.createdAt
            ? [{ text: `${file.sharedBy?.fullName || "Someone"} updated this file`, timestamp: fmt(file.updatedAt) }]
            : []),
        { text: "File uploaded", timestamp: fmt(file.createdAt) },
    ];

    const handleDownload = () => {
        const a = document.createElement("a");
        a.href = file.url;
        a.download = file.name;
        a.target = "_blank";
        a.rel = "noreferrer";
        a.click();
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(file.url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="w-80 h-full bg-white border-l border-gray-100 flex flex-col overflow-y-auto animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <Info className="size-4 text-gray-500" />
                    <span className="font-semibold text-gray-900">File Details</span>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400">
                    <X className="size-5" />
                </button>
            </div>

            <div className="p-6 flex-1">
                {/* Preview */}
                <div className="flex flex-col items-center text-center gap-4 mb-6">
                    {file.type === "image" ? (
                        <div className="w-full aspect-video rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                            <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                        </div>
                    ) : (
                        <div className={`p-6 rounded-2xl ${bg} w-20 h-20 flex items-center justify-center shadow-sm`}>
                            <Icon className={`size-8 ${color}`} />
                        </div>
                    )}
                    <div>
                        <h2 className="text-base font-bold text-gray-900 break-all leading-snug">{file.name}</h2>
                        <p className="text-xs text-gray-400 mt-1 uppercase font-semibold tracking-wide">
                            {file.type} · {formatFileSize(file.size)}
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                    <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-blue-50 text-blue-600 font-semibold text-sm hover:bg-blue-100 transition-colors"
                    >
                        <Eye className="size-4" /> View
                    </a>
                    <button
                        onClick={handleDownload}
                        className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-gray-50 text-gray-700 font-semibold text-sm hover:bg-gray-100 transition-colors"
                    >
                        <Download className="size-4" /> Download
                    </button>
                </div>
                <button
                    onClick={handleCopyLink}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-gray-50 text-gray-700 font-semibold text-sm hover:bg-gray-100 transition-colors mb-2"
                >
                    {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
                    {copied ? "Link copied!" : "Copy link"}
                </button>
                <button
                    onClick={onDelete}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-red-50 text-red-600 font-semibold text-sm hover:bg-red-100 transition-colors mb-8"
                >
                    <Trash2 className="size-4" /> Delete File
                </button>

                {/* Properties */}
                <div className="mb-8">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Properties</h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-start">
                            <span className="text-sm text-gray-500">Location</span>
                            <span className="text-sm font-medium text-gray-900 text-right">File Center</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">Owner</span>
                            {file.sharedBy ? (
                                <div className="flex items-center gap-2">
                                    <Avatar src={file.sharedBy.profilePic} name={file.sharedBy.fullName} size="w-5 h-5" />
                                    <span className="text-sm font-medium text-gray-900 truncate max-w-[110px]">{file.sharedBy.fullName}</span>
                                </div>
                            ) : (
                                <span className="text-sm text-gray-400">—</span>
                            )}
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">Modified</span>
                            <span className="text-sm font-medium text-gray-900">
                                {fmt(file.updatedAt || file.createdAt, { dateStyle: "medium" })}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">Uploaded</span>
                            <span className="text-sm font-medium text-gray-900">
                                {fmt(file.createdAt, { dateStyle: "medium" })}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Recent Activity */}
                <div>
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6">Activity</h3>
                    <ActivityTimeline activities={activities} />
                </div>
            </div>
        </div>
    );
};

export default FileDetailsSidebar;
