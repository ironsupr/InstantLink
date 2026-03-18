import { saveCallLogApi } from './api';

const CALL_LOGS_STORAGE_KEY = 'callLogs';
const ACTIVE_CALLS_STORAGE_KEY = 'collab_active_calls';
const CALL_STORE_EVENT = 'collab:call-store-updated';

const safeParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const emitCallStoreUpdate = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CALL_STORE_EVENT));
};

const saveLogs = (logs) => {
  if (typeof window === 'undefined') return;
  // still save locally for immediate UI feedback/offline-ish support
  localStorage.setItem(CALL_LOGS_STORAGE_KEY, JSON.stringify(logs.slice(0, 100)));
  emitCallStoreUpdate();
};

const saveActiveCalls = (calls) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_CALLS_STORAGE_KEY, JSON.stringify(calls));
  emitCallStoreUpdate();
};

export const getCallLogs = () => {
  if (typeof window === 'undefined') return [];
  return safeParse(localStorage.getItem(CALL_LOGS_STORAGE_KEY), []);
};

export const clearCallLogs = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CALL_LOGS_STORAGE_KEY);
  emitCallStoreUpdate();
};

export const saveCallLog = async (log) => {
  const logs = getCallLogs();
  const nextLog = {
    ...log,
    updatedAt: new Date().toISOString(),
  };
  const existingIndex = logs.findIndex((item) => item.callId === nextLog.callId);

  if (existingIndex >= 0) {
    logs[existingIndex] = {
      ...logs[existingIndex],
      ...nextLog,
    };
  } else {
    logs.unshift(nextLog);
  }

  logs.sort((a, b) => new Date(b.updatedAt || b.startTime || 0) - new Date(a.updatedAt || a.startTime || 0));
  saveLogs(logs);

  // Sync to Backend
  try {
    await saveCallLogApi(nextLog);
  } catch (error) {
    console.error("Failed to sync call log to backend:", error);
  }
};

export const updateCallLog = async (callId, updates) => {
  if (!callId) return;
  const logs = getCallLogs();
  const existingIndex = logs.findIndex((item) => item.callId === callId);
  if (existingIndex === -1) return;

  const nextLog = {
    ...logs[existingIndex],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  logs[existingIndex] = nextLog;
  saveLogs(logs);

  // Sync to Backend
  try {
    await saveCallLogApi(nextLog);
  } catch (error) {
    console.error("Failed to sync call log to backend:", error);
  }
};


export const getActiveCalls = () => {
  if (typeof window === 'undefined') return {};
  return safeParse(localStorage.getItem(ACTIVE_CALLS_STORAGE_KEY), {});
};

export const upsertActiveCall = (call) => {
  if (!call?.callId) return;
  const activeCalls = getActiveCalls();
  activeCalls[call.callId] = {
    ...activeCalls[call.callId],
    ...call,
    updatedAt: new Date().toISOString(),
  };
  saveActiveCalls(activeCalls);
};

export const removeActiveCall = (callId) => {
  if (!callId) return;
  const activeCalls = getActiveCalls();
  if (!activeCalls[callId]) return;
  delete activeCalls[callId];
  saveActiveCalls(activeCalls);
};

export const getActiveCallByConversation = (conversationId) => {
  if (!conversationId) return null;
  const activeCalls = Object.values(getActiveCalls());
  const matches = activeCalls.filter((call) => call?.conversationId === conversationId);
  if (!matches.length) return null;
  matches.sort((a, b) => new Date(b.updatedAt || b.startedAt || 0) - new Date(a.updatedAt || a.startedAt || 0));
  return matches[0];
};

export const isCallOngoing = (call) => Boolean(call?.callId && !call?.endTime && call?.status !== 'missed' && call?.status !== 'ended');

export const subscribeToCallStore = (callback) => {
  if (typeof window === 'undefined') return () => {};

  const handler = () => callback?.();
  const storageHandler = (event) => {
    if ([CALL_LOGS_STORAGE_KEY, ACTIVE_CALLS_STORAGE_KEY].includes(event.key)) {
      callback?.();
    }
  };

  window.addEventListener(CALL_STORE_EVENT, handler);
  window.addEventListener('storage', storageHandler);

  return () => {
    window.removeEventListener(CALL_STORE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
};
