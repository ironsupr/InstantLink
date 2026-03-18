import { isValidAvatarUrl } from "./avatarUtils";

/**
 * A lightweight client-side cache that maps Stream user IDs → profile picture URLs.
 *
 * Why this exists:
 *   Stream Chat strips base64 images from the WebSocket URL to avoid URL-length
 *   overflow errors. So `message.user.image` is always "" for users whose profilePic
 *   is a base64 data-URL. This cache lets the app supply the real picture client-side.
 *
 * Usage:
 *   // Populate (once, when connecting to Stream):
 *   setUserImageCache(userId, profilePicUrl);
 *
 *   // Read (inside SlackMessage or any component):
 *   const url = getUserImage(userId, fallbackFromStream);
 */

const _cache = {};

/** Register a user's profile picture (only if it's a real photo, not a placeholder). */
export function setUserImageCache(userId, imageUrl) {
    if (userId && isValidAvatarUrl(imageUrl)) {
        _cache[userId] = imageUrl;
    }
}

/** Get the best available image URL for a user (returns "" for placeholder URLs). */
export function getUserImage(userId, streamImageUrl) {
    const cached = _cache[userId];
    if (cached) return cached;
    // Also filter the Stream-stored image in case an old iran URL is still there
    return isValidAvatarUrl(streamImageUrl) ? streamImageUrl : "";
}
