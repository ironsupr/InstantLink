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
} from "lucide-react";

/**
 * SlackMessage — fully custom Slack-style message renderer.
 *
 * Layout:
 * [Avatar]  [BoldName]  [muted timestamp]        [on hover: toolbar]
 *           [message text, flat / no bubble]
 *           [reactions pills] [thread reply count]
 */
const SlackMessage = () => {
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

    const { handleQuotedMessageChange } = useChannelActionContext();

    const [isHovered, setIsHovered] = useState(false);
    const [showReactions, setShowReactions] = useState(false);
    const [showActions, setShowActions] = useState(false);
    const emojiRef = useRef(null);

    /* ── Deleted ────────────────────────────── */
    if (message.type === "deleted") {
        return (
            <div
                className="str-chat__message"
                style={{ padding: "2px 20px", fontStyle: "italic", color: "#9E9EA6", fontSize: 14 }}
            >
                This message was deleted.
            </div>
        );
    }

    /* ── Editing inline ─────────────────────── */
    if (editing && EditMessageInput) {
        return (
            <div style={{ padding: "4px 20px" }}>
                <EditMessageInput />
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

    /* ─────────────────────────────────
       Shared toolbar button styles
    ───────────────────────────────── */
    const btnBase = {
        width: 30, height: 30,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 6,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: "#616061",
        transition: "background 0.12s, color 0.12s",
        flexShrink: 0,
    };
    const btnHoverStyle = { background: "#EAEAEA", color: "#1D1C1D" };

    return (
        <div
            className="slack-message-row"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setShowActions(false); }}
            style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-start",
                padding: isFirst ? "8px 20px 2px" : "2px 20px",
                gap: 10,
                position: "relative",
                background: isHovered ? "#F8F8F8" : "#FFFFFF",
                transition: "background 0.1s",
            }}
        >
            {/* ── Avatar ── */}
            <div
                style={{
                    width: 36, flexShrink: 0,
                    display: "flex", alignItems: "flex-start",
                    paddingTop: isFirst ? 2 : 0,
                    visibility: isFirst ? "visible" : "hidden",
                }}
            >
                <Avatar src={avatarSrc} name={senderName} size="w-9 h-9" rounded="rounded-md" />
            </div>

            {/* ── Content ── */}
            <div style={{ flex: 1, minWidth: 0 }}>
                {isFirst && (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                        <span
                            style={{ fontWeight: 700, fontSize: 15, color: "#1D1C1D", lineHeight: 1.4, cursor: "pointer" }}
                            onClick={onUserClick}
                        >
                            {senderName}
                        </span>
                        <span style={{ fontSize: 12, color: "#9E9EA6", fontWeight: 400 }}>
                            {time}
                        </span>
                    </div>
                )}

                {/* ── Quoted message preview ── */}
                {message.quoted_message && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                            borderLeft: "3px solid #1264A3",
                            background: "#F1F7FF",
                            borderRadius: "0 6px 6px 0",
                            padding: "6px 10px",
                            marginBottom: 6,
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#1264A3", marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                                <CornerUpRight size={11} style={{ flexShrink: 0 }} />
                                {message.quoted_message.user?.name || "Unknown"}
                            </div>
                            <div style={{ fontSize: 13, color: "#616061", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {message.quoted_message.text
                                    ? message.quoted_message.text.slice(0, 140) + (message.quoted_message.text.length > 140 ? "\u2026" : "")
                                    : message.quoted_message.attachments?.length
                                        ? "\uD83D\uDCCE Attachment"
                                        : ""}
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ fontSize: 15, lineHeight: 1.55, color: "#1D1C1D", wordBreak: "break-word" }}>
                    {message.text}
                </div>

                {hasReactions && (
                    <div style={{ marginTop: 4 }}>
                        <ReactionsList />
                    </div>
                )}

                {hasThread && (
                    <button
                        onClick={handleOpenThread}
                        style={{
                            marginTop: 5,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            background: "none",
                            border: "1px solid transparent",
                            borderRadius: 6,
                            padding: "3px 8px 3px 3px",
                            cursor: "pointer",
                            color: "#1264A3",
                            fontSize: 13,
                            fontWeight: 600,
                            lineHeight: 1,
                            transition: "background 0.1s, border-color 0.1s",
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = "#F1F7FF";
                            e.currentTarget.style.borderColor = "#C9DEF4";
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = "none";
                            e.currentTarget.style.borderColor = "transparent";
                        }}
                    >
                        {/* Participant mini-avatars */}
                        <div style={{ display: "flex" }}>
                            {(message.thread_participants || []).slice(0, 4).map((p, i) => (
                                <div
                                    key={p.id || i}
                                    style={{
                                        width: 18, height: 18,
                                        borderRadius: "50%",
                                        overflow: "hidden",
                                        border: "1.5px solid #FFFFFF",
                                        marginLeft: i > 0 ? -5 : 0,
                                        zIndex: 4 - i,
                                        position: "relative",
                                        flexShrink: 0,
                                    }}
                                >
                                    <Avatar src={getUserImage(p.id, p.image)} name={p.name} size="w-full h-full" />
                                </div>
                            ))}
                        </div>
                        <span>
                            {message.reply_count} {message.reply_count === 1 ? "reply" : "replies"}
                        </span>
                    </button>
                )}
            </div>

            {/* ══════════════════════════════════
                HOVER TOOLBAR — Slack style
            ══════════════════════════════════ */}
            <div
                style={{
                    position: "absolute",
                    top: isFirst ? 8 : 2,
                    right: 20,
                    zIndex: 300,
                    opacity: isHovered ? 1 : 0,
                    pointerEvents: isHovered ? "auto" : "none",
                    transition: "opacity 0.12s ease",
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 2,
                    /* Pill container */
                    background: "#FFFFFF",
                    border: "1px solid #E0E0E0",
                    borderRadius: 8,
                    boxShadow: "0 2px 12px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)",
                    padding: "3px 5px",
                }}
            >
                {/* Emoji react */}
                <div style={{ position: "relative" }} ref={emojiRef}>
                    <button
                        title="Add reaction"
                        style={btnBase}
                        onMouseEnter={e => Object.assign(e.currentTarget.style, btnHoverStyle)}
                        onMouseLeave={e => Object.assign(e.currentTarget.style, { background: "transparent", color: "#616061" })}
                        onClick={() => setShowReactions(v => !v)}
                    >
                        <SmilePlus size={15} />
                    </button>
                    {showReactions && (
                        <div style={{ position: "absolute", bottom: "calc(100% + 6px)", right: 0, zIndex: 400 }}>
                            <ReactionSelector
                                handleReaction={(reactionType, event) => {
                                    handleReaction(reactionType, event);
                                    setShowReactions(false);
                                }}
                                latest_reactions={message.latest_reactions}
                                own_reactions={message.own_reactions}
                                reaction_groups={message.reaction_groups}
                            />
                        </div>
                    )}
                </div>

                {/* Divider */}
                <div style={{ width: 1, height: 18, background: "#EBEBEB", margin: "0 2px" }} />

                {/* Reply in thread */}
                <button
                    title="Reply in thread"
                    style={btnBase}
                    onMouseEnter={e => Object.assign(e.currentTarget.style, btnHoverStyle)}
                    onMouseLeave={e => Object.assign(e.currentTarget.style, { background: "transparent", color: "#616061" })}
                    onClick={handleOpenThread}
                >
                    <MessageSquare size={15} />
                </button>

                {/* Quote reply — sets quoted message on the channel input */}
                <button
                    title="Quote reply"
                    style={btnBase}
                    onMouseEnter={e => Object.assign(e.currentTarget.style, btnHoverStyle)}
                    onMouseLeave={e => Object.assign(e.currentTarget.style, { background: "transparent", color: "#616061" })}
                    onClick={() => handleQuotedMessageChange(message)}
                >
                    <CornerUpRight size={15} />
                </button>

                {/* Divider */}
                <div style={{ width: 1, height: 18, background: "#EBEBEB", margin: "0 2px" }} />

                {/* More actions */}
                <div style={{ position: "relative" }}>
                    <button
                        title="More actions"
                        style={btnBase}
                        onMouseEnter={e => Object.assign(e.currentTarget.style, btnHoverStyle)}
                        onMouseLeave={e => Object.assign(e.currentTarget.style, { background: "transparent", color: "#616061" })}
                        onClick={() => setShowActions(v => !v)}
                    >
                        <MoreHorizontal size={15} />
                    </button>

                    {/* Actions dropdown */}
                    {showActions && (
                        <div
                            style={{
                                position: "absolute",
                                top: "calc(100% + 6px)",
                                right: 0,
                                zIndex: 400,
                                background: "#FFFFFF",
                                border: "1px solid #E0E0E0",
                                borderRadius: 8,
                                boxShadow: "0 4px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)",
                                minWidth: 160,
                                overflow: "hidden",
                                padding: "4px 0",
                            }}
                        >
                            <button
                                type="button"
                                className="w-full px-4 py-2 text-left text-sm hover:bg-base-200 transition-colors"
                                onClick={(event) => {
                                    handleQuotedMessageChange(message);
                                    setShowActions(false);
                                }}
                            >
                                Reply
                            </button>
                            {isMine && (
                                <>
                                    <button
                                        type="button"
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-base-200 transition-colors"
                                        onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            setEditingState(event);
                                            setShowActions(false);
                                        }}
                                    >
                                        Edit message
                                    </button>
                                    <button
                                        type="button"
                                        className="w-full px-4 py-2 text-left text-sm text-error hover:bg-base-200 transition-colors"
                                        onClick={(event) => {
                                            handleDelete(event);
                                            setShowActions(false);
                                        }}
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
    );
};

export default SlackMessage;
