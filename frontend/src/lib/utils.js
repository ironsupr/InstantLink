export const capitialize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

/**
 * Formats a raw byte count into a human-readable string (e.g. "2.4 MB").
 * Accepts both the new Number format and legacy formatted strings from old
 * records, so the UI stays backwards-compatible during migration.
 */
export const formatFileSize = (size) => {
  if (typeof size === "string") return size; // legacy formatted string
  if (size == null || isNaN(size)) return "Unknown";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};
