import { buildApiUrl } from "./runtimeConfig";

// Google / Teams-style palette: soft background + matching accent text.
const COLORS = [
    { bg: "#e8f0fe", text: "#1a73e8" }, // blue
    { bg: "#e6f4ea", text: "#0f9d58" }, // green
    { bg: "#fef7e0", text: "#f29900" }, // yellow
    { bg: "#fce8e6", text: "#d93025" }, // red
    { bg: "#f3e8fd", text: "#7b1fa2" }, // purple
    { bg: "#e0f2f1", text: "#00796b" }, // teal
    { bg: "#fbe9e7", text: "#e64a19" }, // orange
    { bg: "#e3f2fd", text: "#1565c0" }, // dark blue
    { bg: "#f1f8e9", text: "#558b2f" }, // light green
    { bg: "#fce4ec", text: "#c2185b" }, // pink
];

const BLOCKED_AVATAR_HOSTS = new Set([
    "ui-avatars.com",
    "www.ui-avatars.com",
]);

const CLOUDINARY_HOSTS = new Set([
    "res.cloudinary.com",
]);

const IMAGE_PROXY_BASE = buildApiUrl("/files/image-proxy");

/**
 * Returns true when the value is a displayable photo URL or data URI.
 * Rejects only empty / blank values.
 */
export function isValidAvatarUrl(url) {
    if (!url || !url.trim()) return false;
    if (url.startsWith("data:")) return true; // base64 upload — always valid
    try {
        const { protocol, hostname } = new URL(url);
        if (BLOCKED_AVATAR_HOSTS.has(hostname)) return false;
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
}

export function getDisplayImageUrl(url) {
    if (!isValidAvatarUrl(url) || url.startsWith("data:")) return url;

    try {
        const parsedUrl = new URL(url);
        if (!CLOUDINARY_HOSTS.has(parsedUrl.hostname)) {
            return url;
        }

        return `${IMAGE_PROXY_BASE}?url=${encodeURIComponent(parsedUrl.toString())}`;
    } catch {
        return url;
    }
}

/**
 * Returns { bg, text } deterministically from the user's name.
 */
export function getAvatarColor(name = "") {
    if (!name) return COLORS[0];
    let h = 0;
    for (let i = 0; i < name.length; i++) {
        h = name.charCodeAt(i) + ((h << 5) - h);
    }
    return COLORS[Math.abs(h) % COLORS.length];
}

export function getInitials(name = "") {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
