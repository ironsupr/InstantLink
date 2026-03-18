const SEEN_NOTIFICATIONS_KEY = "collab_seen_notifications";
const NOTIFICATION_STATE_EVENT = "collab-notification-state-changed";

export const buildNotificationKeys = (data = {}) => {
  const incoming = data?.incomingReqs || [];
  const accepted = data?.acceptedReqs || [];

  return [
    ...incoming.map((item) => `incoming:${item._id}`),
    ...accepted.map((item) => `accepted:${item._id}`),
  ];
};

export const getSeenNotificationIds = () => {
  try {
    const raw = localStorage.getItem(SEEN_NOTIFICATIONS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(Boolean));
  } catch {
    return new Set();
  }
};

export const markNotificationsAsSeen = (notificationKeys = []) => {
  if (!Array.isArray(notificationKeys) || notificationKeys.length === 0) return;

  const seen = getSeenNotificationIds();
  let changed = false;

  notificationKeys.forEach((key) => {
    if (!seen.has(key)) {
      seen.add(key);
      changed = true;
    }
  });

  if (!changed) return;

  try {
    localStorage.setItem(SEEN_NOTIFICATIONS_KEY, JSON.stringify([...seen]));
    window.dispatchEvent(new Event(NOTIFICATION_STATE_EVENT));
  } catch {
    // ignore localStorage failures
  }
};

export const getNotificationStateEventName = () => NOTIFICATION_STATE_EVENT;
