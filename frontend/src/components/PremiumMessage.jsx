import { useState, useRef } from "react";
import {
    useMessageContext,
    useChannelActionContext,
    ReactionSelector,
    ReactionsList,
} from "stream-chat-react";
import Avatar from "./Avatar";
import { getUserImage } from "../lib/userImageCache";
import {
    SmilePlus,
    MessageSquare,
    MoreHorizontal,
    CornerUpRight,
    Check,
    CheckCheck,
    Paperclip,
    Download,
    Image as ImageIcon,
} from "lucide-react";

const getAttachmentUrl = (attachment = {}) => {
    const rawUrl = (
        attachment.asset_url ||
        attachment.image_url ||
        attachment.thumb_url ||
        attachment.title_link ||
        attachment.file ||
        attachment.url ||
        ""
    );

    if (!rawUrl || typeof rawUrl !== "string") return "";
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl;
    if (rawUrl.startsWith("//")) return `https:${rawUrl}`;
    if (rawUrl.startsWith("/")) return `${window.location.origin}${rawUrl}`;
    return rawUrl;
};

const getAttachmentDownloadUrl = (attachment = {}) => {
    const url = getAttachmentUrl(attachment);
    if (!url) return "";

    // Cloudinary raw files are more reliable with forced attachment delivery.
    if (url.includes("res.cloudinary.com") && !isImageAttachment(attachment) && url.includes("/upload/")) {
        return url.replace("/upload/", "/upload/fl_attachment/");
    }
    return url;
};

const isImageAttachment = (attachment = {}) => {
    const mimeType = (attachment.mime_type || "").toLowerCase();
    const type = (attachment.type || "").toLowerCase();
    const url = getAttachmentUrl(attachment).toLowerCase();
    return (
        mimeType.startsWith("image/") ||
        type === "image" ||
        /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/.test(url)
    );
};

/**
 * PremiumMessage — A state-of-the-art message renderer with glassmorphism and depth.
 * 
 * Improvements over SlackMessage:
 * - Refined spacing and typography.
 * - Glassmorphic hover effects.
 * - Better handling of message grouping.
 * - "Premium" feel with subtle shadows and border gradients.
 */
const PremiumMessage = () => {
    const {
        message,
        isMyMessage,
        handleOpenThread,
        editing,
        EditMessageInput,
        groupStyles,
        handleDelete,
        handleReaction,
        onUserClick,
        setEditingState,
    } = useMessageContext();

    const { setQuotedMessage } = useChannelActionContext();

    const [isHovered, setIsHovered] = useState(false);
    const [showReactions, setShowReactions] = useState(false);
    const [showActions, setShowActions] = useState(false);
    const emojiRef = useRef(null);

    /* ── Deleted ────────────────────────────── */
    if (message.type === "deleted") {
        return (
            <div
                className="str-chat__message"
                style={{ padding: "4px 24px", fontStyle: "italic", color: "rgb(var(--base-content) / 0.4)", fontSize: 13 }}
            >
                This message was deleted.
            </div>
        );
    }

    /* ── Editing inline ─────────────────────── */
    if (editing && EditMessageInput) {
        return (
            <div className="px-6 py-2">
                <div className="bg-base-200/50 backdrop-blur-md rounded-xl p-3 border border-base-300 shadow-sm">
                    <EditMessageInput />
                </div>
            </div>
        );
    }

    const sender = message.user;
    const senderName = sender?.name || sender?.id || "Unknown";
    const avatarSrc = getUserImage(sender?.id, sender?.image);
    const isMine = isMyMessage();

    const time = message.created_at
        ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";

    /* Only show avatar+name on the FIRST message of a group */
    const isFirst = !groupStyles || groupStyles[0] === "single" || groupStyles[0] === "top";

    const hasReactions = message.latest_reactions?.length > 0;
    const hasThread = !!message.reply_count;
    const attachments = Array.isArray(message.attachments)
        ? message.attachments.filter((att) => getAttachmentUrl(att))
        : [];

    return (
        <div
            className={`group relative flex items-start gap-4 px-6 transition-all duration-300 ease-in-out
                ${isFirst ? "pt-4 pb-1" : "py-0.5"}
                ${isHovered ? "bg-primary/5 shadow-[inset_4px_0_0_0_rgb(var(--primary))]" : "bg-transparent"}
            `}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setShowActions(false); }}
        >
            {/* ── Avatar Column ── */}
            <div className="w-10 flex-shrink-0 flex items-start justify-center pt-0.5">
                {isFirst ? (
                    <div className="relative group/avatar cursor-pointer" onClick={onUserClick}>
                        <Avatar src={avatarSrc} name={senderName} size="w-10 h-10" rounded="rounded-xl" className="shadow-sm transition-transform group-hover/avatar:scale-105" />
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success border-2 border-base-100 rounded-full shadow-sm"></div>
                    </div>
                ) : (
                    <span className="text-[10px] text-base-content/30 opacity-0 group-hover:opacity-100 transition-opacity font-medium mt-1">
                        {time}
                    </span>
                )}
            </div>

            {/* ── Content Column ── */}
            <div className="flex-1 min-w-0">
                {isFirst && (
                    <div className="flex items-center gap-2 mb-1">
                        <span
                            className="font-bold text-[15px] text-base-content leading-tight hover:text-primary cursor-pointer transition-colors"
                            onClick={onUserClick}
                        >
                            {senderName}
                        </span>
                        <span className="text-xs text-base-content/40 font-medium">
                            {time}
                        </span>
                        {isMine && (
                             <span className="text-primary/60">
                                 <CheckCheck size={14} />
                             </span>
                        )}
                    </div>
                )}

                {/* ── Quoted Message Preview ── */}
                {message.quoted_message && (
                    <div 
                        onClick={() => {
                            const originalId = message.quoted_message.id;
                            const el = document.querySelector(`[data-message-id="${originalId}"]`);
                            if (el) {
                                el.scrollIntoView({ behavior: "smooth", block: "center" });
                                el.classList.add("highlight-message");
                                setTimeout(() => el.classList.remove("highlight-message"), 2000);
                            }
                        }}
                        className="flex items-start gap-3 border-l-4 border-primary bg-primary/5 hover:bg-primary/10 rounded-r-2xl px-4 py-3 mb-3 max-w-2xl backdrop-blur-md border border-primary/10 cursor-pointer transition-all active:scale-[0.98] group/quote shadow-sm"
                    >
                        <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-bold text-primary flex items-center gap-2 mb-1 uppercase tracking-widest">
                                <CornerUpRight size={13} strokeWidth={3} />
                                {message.quoted_message.user?.name || "Unknown"}
                            </div>
                            <div className="text-[13px] text-base-content/70 leading-relaxed truncate-2-lines italic font-medium">
                                {message.quoted_message.text || "View attachment"}
                            </div>
                        </div>
                    </div>
                )}

                <div className="text-[15px] leading-relaxed text-base-content/90 word-break-all whitespace-pre-wrap">
                    {message.text}
                </div>

                {attachments.length > 0 && (
                    <div className="mt-3 grid gap-2 max-w-2xl">
                        {attachments.map((att, index) => {
                            const attachmentUrl = getAttachmentUrl(att);
                            const downloadUrl = getAttachmentDownloadUrl(att);
                            const title = att.title || att.name || "Attachment";
                            const isImage = isImageAttachment(att);

                            if (isImage) {
                                return (
                                    <a
                                        key={`${attachmentUrl}-${index}`}
                                        href={attachmentUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="group block overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm hover:shadow-md transition"
                                    >
                                        <img
                                            src={attachmentUrl}
                                            alt={title}
                                            className="max-h-80 w-full object-cover"
                                            loading="lazy"
                                        />
                                        <div className="flex items-center gap-2 px-3 py-2 text-sm text-base-content/70 group-hover:text-primary transition-colors">
                                            <ImageIcon size={14} />
                                            <span className="truncate">{title}</span>
                                        </div>
                                    </a>
                                );
                            }

                            return (
                                <a
                                    key={`${attachmentUrl}-${index}`}
                                    href={attachmentUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-3 rounded-2xl border border-base-300 bg-base-100 px-3 py-2 shadow-sm hover:border-primary/40 hover:bg-primary/5 transition"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                                        <Paperclip size={16} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold truncate text-base-content">{title}</p>
                                        <p className="text-xs text-base-content/50 truncate">{att.mime_type || "File"}</p>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-xs"
                                        title="Download attachment"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const urlToOpen = downloadUrl || attachmentUrl;
                                            if (urlToOpen) window.open(urlToOpen, "_blank", "noopener,noreferrer");
                                        }}
                                    >
                                        <Download size={14} />
                                    </button>
                                </a>
                            );
                        })}
                    </div>
                )}

                {/* ── Reactions ── */}
                {hasReactions && (
                    <div className="mt-2.5">
                        <ReactionsList />
                    </div>
                )}

            </div>

            {/* ── Floating Toolbar — Glassy & Modern ── */}
            <div
                className={`absolute top-0 right-6 z-50 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]
                    ${isHovered ? "opacity-100 -translate-y-1/2 scale-100" : "opacity-0 translate-y-0 scale-95 pointer-events-none"}
                `}
                style={{ top: isFirst ? "1rem" : "0.5rem" }}
            >
                <div className="flex items-center gap-0.5 bg-base-100/90 backdrop-blur-xl border border-base-300/50 shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-xl p-1.5">
                    {/* Emoji */}
                    <div className="relative" ref={emojiRef}>
                        <button
                            title="Quick React"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-base-content/60 hover:text-primary hover:bg-primary/10 transition-all"
                            onClick={() => setShowReactions(v => !v)}
                        >
                            <SmilePlus size={18} strokeWidth={2.2} />
                        </button>
                        {showReactions && (
                            <div className="absolute bottom-full right-0 mb-3 z-[60] animate-in fade-in zoom-in slide-in-from-bottom-2 duration-200">
                                <div className="bg-base-100 border border-base-300 shadow-2xl rounded-2xl overflow-hidden p-1">
                                    <ReactionSelector
                                        handleReaction={(type, ev) => {
                                            // Enforce 1 reaction by removing existing ones first
                                            if (message.own_reactions?.length > 0) {
                                                message.own_reactions.forEach(r => {
                                                    if (r.type !== type) {
                                                        // Toggle off old ones
                                                        handleReaction(r.type, ev);
                                                    }
                                                });
                                            }
                                            handleReaction(type, ev);
                                            setShowReactions(false);
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>


                    {/* Quote */}
                    <button
                        title="Reply"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-base-content/60 hover:text-primary hover:bg-primary/10 transition-all"
                        onClick={() => setQuotedMessage(message)}
                    >
                        <CornerUpRight size={18} strokeWidth={2.2} />
                    </button>

                    {/* More */}
                    <div className="relative">
                        <button
                            title="More actions"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-base-content/60 hover:text-primary hover:bg-primary/10 transition-all"
                            onClick={() => setShowActions(v => !v)}
                        >
                            <MoreHorizontal size={18} strokeWidth={2.2} />
                        </button>

                        {showActions && (
                            <div className="absolute top-full right-0 mt-2 z-[60] py-1 bg-base-100 border border-base-300 shadow-2xl rounded-xl min-w-[180px] overflow-hidden animate-in fade-in zoom-in slide-in-from-top-2 duration-200">
                                <button
                                    onClick={() => { setQuotedMessage(message); setShowActions(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-primary/10 hover:text-primary transition-colors"
                                >
                                    Reply
                                </button>
                                {isMine && (
                                    <>
                                        <button
                                            onClick={(e) => { setEditingState(e); setShowActions(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-primary/10 hover:text-primary transition-colors"
                                        >
                                            Edit message
                                        </button>
                                        <div className="h-px bg-base-200 my-1" />
                                        <button
                                            onClick={(e) => { handleDelete(e); setShowActions(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left text-error hover:bg-error/10 transition-colors font-medium"
                                        >
                                            Delete message
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PremiumMessage;
