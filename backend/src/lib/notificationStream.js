const subscribersByUserId = new Map();

export const subscribeNotificationStream = (userId, response) => {
  const key = String(userId);
  const subscribers = subscribersByUserId.get(key) || new Set();
  subscribers.add(response);
  subscribersByUserId.set(key, subscribers);
};

export const unsubscribeNotificationStream = (userId, response) => {
  const key = String(userId);
  const subscribers = subscribersByUserId.get(key);
  if (!subscribers) return;

  subscribers.delete(response);
  if (subscribers.size === 0) {
    subscribersByUserId.delete(key);
  }
};

export const emitNotificationEvent = (userId, payload = {}) => {
  const key = String(userId);
  const subscribers = subscribersByUserId.get(key);
  if (!subscribers || subscribers.size === 0) return;

  const data = JSON.stringify({
    timestamp: Date.now(),
    ...payload,
  });

  subscribers.forEach((response) => {
    try {
      response.write(`event: notification\n`);
      response.write(`data: ${data}\n\n`);
      if (typeof response.flush === "function") {
        response.flush();
      }
    } catch {
      // Ignore stale sockets; request close handler performs cleanup.
    }
  });
};
