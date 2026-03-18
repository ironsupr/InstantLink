import React from "react";
import { getAvatarColor, getDisplayImageUrl, getInitials, isValidAvatarUrl } from "../lib/avatarUtils";

/**
 * Unified Avatar — Google/Teams style: soft coloured background + accent initials.
 * Shows the user photo when available; falls back to coloured initials on error or when no src.
 *
 * @param {string} src       Image URL
 * @param {string} name      Full name — used for initials and deterministic colour
 * @param {string} size      Tailwind size class(es), e.g. "w-10 h-10" or "w-44 h-44 lg:w-52 lg:h-52"
 * @param {string} rounded   Tailwind rounding class (default: "rounded-full")
 * @param {string} className Extra classes (rings, shadows, …)
 */
const Avatar = ({ src, name, size = "w-10 h-10", rounded = "rounded-full", className = "", style = {} }) => {
    const { bg, text } = getAvatarColor(name);
    const initials = getInitials(name);
    const displaySrc = getDisplayImageUrl(src);

    // Derive font-size from the first Tailwind width token so initials scale
    // correctly at any avatar size. Tailwind: 1 spacing unit = 4 px.
    // Examples: w-6→24px→9px  w-10→40px→15px  w-12→48px→18px  w-44→176px→67px
    const widthMatch = size.match(/w-(\d+)/);
    const widthPx = widthMatch ? parseInt(widthMatch[1], 10) * 4 : 40;
    const fontSize = Math.max(8, Math.round(widthPx * 0.38));

    return (
        <div
            className={`${size} ${rounded} flex items-center justify-center font-semibold overflow-hidden relative flex-shrink-0 ${className}`}
            style={{ background: bg, ...style }}
            title={name}
        >
            <span style={{ color: text, fontSize, lineHeight: 1, userSelect: "none" }}>
                {initials}
            </span>
            {isValidAvatarUrl(displaySrc) && (
                <img
                    src={displaySrc}
                    alt={name}
                    className="absolute inset-0 w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => { e.target.style.display = "none"; }}
                />
            )}
        </div>
    );
};

export default Avatar;
