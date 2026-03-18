import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Link } from "react-router";
import { getStreamToken } from "../lib/api";
import useAuthUser from "../hooks/useAuthUser";
import Avatar from "../components/Avatar";
import { isValidAvatarUrl } from "../lib/avatarUtils";
import { setUserImageCache } from "../lib/userImageCache";
import { mergePresenceUser } from "../lib/presenceUtils";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;
const StreamContext = createContext(null);

/* ── Message toast ─────────────────────────────── */
const MsgToast = ({ t, avatar, senderName, text, partnerId }) => (
  <Link
    to={`/chat/${partnerId}`}
    onClick={() => toast.dismiss(t.id)}
    className={`flex items-start gap-3 bg-base-100 border border-base-300 shadow-xl rounded-xl px-4 py-3 w-72 cursor-pointer transition-all ${t.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
  >
    <Avatar
      src={avatar}
      name={senderName}
      size="w-9 h-9"
      rounded="rounded-full"
      className="flex-shrink-0 mt-0.5"
    />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold leading-tight">{senderName}</p>
      <p className="text-xs text-base-content/60 truncate mt-0.5">{text}</p>
      <p className="text-[10px] text-primary mt-1">Click to reply →</p>
    </div>
  </Link>
);

/* ── helpers ────────────────────────────────────── */
const extractPartnerId = (channelId, selfId) => {
  if (!channelId || !selfId) return null;
  // Channel IDs are `[id1, id2].sort().join("-")`. Both IDs are 24-char hex
  // with no internal dashes, so a single "-" separates them.
  const idx = channelId.indexOf("-");
  if (idx === -1) return null;
  const a = channelId.slice(0, idx);
  const b = channelId.slice(idx + 1);
  return a === selfId ? b : a;
};

const msgPreview = (message) => {
  if (!message) return "";
  if (message.text) return message.text;
  if (message.attachments && message.attachments.length) return "📎 Attachment";
  return "";
};

const sanitizeStreamImage = (imageUrl) =>
  isValidAvatarUrl(imageUrl || "") ? imageUrl : "";

const MUTED_CONVERSATIONS_KEY = "collab_muted_conversations";
const NOTIFICATION_PREFS_KEY = "collab_notification_preferences";
const DEFAULT_CONVERSATION_PREFS = {
  messages: false,
  calls: false,
  ringtoneVolume: 0.6,
  vibrate: true,
};

let streamChatClassPromise;
const getStreamChatClass = async () => {
  if (!streamChatClassPromise) {
    streamChatClassPromise = import("stream-chat").then((mod) => mod.StreamChat);
  }
  return streamChatClassPromise;
};

/* ════════════════════════════════════════════════ */
export const StreamProvider = ({ children }) => {
  const { authUser } = useAuthUser();
  const shouldBootstrapStream = Boolean(authUser?._id && authUser?.isOnboarded && authUser?.organization);

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: shouldBootstrapStream,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const streamApiKey = tokenData?.apiKey || STREAM_API_KEY;

  /* dmMeta: { [partnerUserId]: { unread, lastMsg, lastMsgAt, lastMsgSenderId, channelId, partnerName, partnerImage } } */
  const [dmMeta, setDmMeta] = useState({});
  const [channelMeta, setChannelMeta] = useState({});
  const [presenceById, setPresenceById] = useState({});
  const cleanupRef = useRef(null);
  /* Keep stable refs for use inside event callbacks */
  const selfIdRef = useRef(null);
  useEffect(() => {
    selfIdRef.current = authUser?._id ?? null;
    if (typeof window !== "undefined") {
      window.__collabAuthUserId = authUser?._id ?? null;
      if (authUser?._id) {
        window.__collabLastActive = Date.now();
      }
    }
  }, [authUser]);

  const dmMetaRef = useRef(dmMeta);
  useEffect(() => { dmMetaRef.current = dmMeta; }, [dmMeta]);

  const channelMetaRef = useRef(channelMeta);
  useEffect(() => { channelMetaRef.current = channelMeta; }, [channelMeta]);

  const upsertPresenceUsers = useCallback((users = []) => {
    if (!Array.isArray(users) || users.length === 0) return;

    setPresenceById((prev) => {
      let changed = false;
      const next = { ...prev };

      users.forEach((user) => {
        const userId = user?.id || user?._id;
        if (!userId) return;

        const prevUser = prev[userId];

        // If we recently forced this user online locally, don't let a stale
        // server event (like user_updated) instantly mark them offline again.
        let safeUser = { ...user };
        if (prevUser?.last_active && user.last_active) {
          const prevTime = new Date(prevUser.last_active).getTime();
          const newTime = new Date(user.last_active).getTime();
          if (prevTime > newTime) {
            safeUser.last_active = prevUser.last_active;
            if (prevUser.online) safeUser.online = true;
          }
        }

        const merged = mergePresenceUser(prevUser, {
          ...safeUser,
          id: userId,
          image: sanitizeStreamImage(safeUser?.image) || safeUser?.profilePic || "",
        });

        const prevSerialized = JSON.stringify(prev[userId] || null);
        const nextSerialized = JSON.stringify(merged || null);
        if (prevSerialized !== nextSerialized) {
          next[userId] = merged;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, []);

  const getUserPresence = useCallback((userId, fallbackUser = null) => {
    if (!userId && !fallbackUser) return null;
    const key = userId || fallbackUser?._id || fallbackUser?.id;
    return mergePresenceUser(fallbackUser, key ? presenceById[key] : null);
  }, [presenceById]);

  const refreshUserPresence = useCallback(async (userIds = []) => {
    const ids = Array.from(new Set(userIds.filter(Boolean)));
    if (!ids.length) return [];

    try {
      const StreamChat = await getStreamChatClass();
      if (!streamApiKey) return [];
      const client = StreamChat.getInstance(streamApiKey);
      if (!client?.userID) return [];

      const response = await client.queryUsers(
        { id: { $in: ids } },
        { last_active: -1 },
        { limit: Math.max(ids.length, 10), presence: true }
      );

      const users = response?.users || [];
      upsertPresenceUsers(users);
      return users;
    } catch (error) {
      console.warn("[StreamContext] Failed to refresh presence:", error);
      return [];
    }
  }, [streamApiKey, upsertPresenceUsers]);

  /* ── Browser notification permission ───────────── */
  const [notifPermission, setNotifPermission] = useState(
    () => ("Notification" in window ? Notification.permission : "unsupported")
  );
  const [notificationPrefs, setNotificationPrefs] = useState(() => {
    try {
      const savedPrefs = JSON.parse(localStorage.getItem(NOTIFICATION_PREFS_KEY) || "null");
      if (savedPrefs && typeof savedPrefs === "object") return savedPrefs;

      const legacyMutedIds = JSON.parse(localStorage.getItem(MUTED_CONVERSATIONS_KEY) || "[]");
      return Array.isArray(legacyMutedIds)
        ? Object.fromEntries(
          legacyMutedIds.map((id) => [id, { messages: true, calls: true }])
        )
        : {};
    } catch {
      return {};
    }
  });

  const notificationPrefsRef = useRef(notificationPrefs);
  useEffect(() => { notificationPrefsRef.current = notificationPrefs; }, [notificationPrefs]);

  const updateNotificationPrefs = useCallback((updater) => {
    setNotificationPrefs((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getConversationAliases = useCallback((conversationId) => {
    if (!conversationId) return [];

    const aliases = new Set();
    const selfId = selfIdRef.current;
    const meta = dmMetaRef.current;
    const partnerId = extractPartnerId(conversationId, selfId);

    if (partnerId) {
      aliases.add(partnerId);
      const partnerChannelId = meta?.[partnerId]?.channelId;
      if (partnerChannelId) aliases.add(partnerChannelId);
    }

    const mappedChannelId = meta?.[conversationId]?.channelId;
    if (mappedChannelId) aliases.add(mappedChannelId);

    aliases.delete(conversationId);
    return [...aliases, conversationId];
  }, []);

  const isDefaultConversationPrefs = useCallback((prefs) => (
    !prefs?.messages &&
    !prefs?.calls &&
    prefs?.ringtoneVolume === DEFAULT_CONVERSATION_PREFS.ringtoneVolume &&
    prefs?.vibrate === DEFAULT_CONVERSATION_PREFS.vibrate
  ), []);

  const getConversationPrefs = useCallback(
    (conversationId) => {
      const aliases = getConversationAliases(conversationId);
      return aliases.reduce(
        (prefs, key) => ({
          ...prefs,
          ...(notificationPrefs?.[key] || {}),
        }),
        { ...DEFAULT_CONVERSATION_PREFS }
      );
    },
    [getConversationAliases, notificationPrefs]
  );

  const isMessageMuted = useCallback(
    (conversationId) => !!getConversationPrefs(conversationId)?.messages,
    [getConversationPrefs]
  );

  const isCallMuted = useCallback(
    (conversationId) => !!getConversationPrefs(conversationId)?.calls,
    [getConversationPrefs]
  );

  const isConversationMuted = useCallback(
    (conversationId) => isMessageMuted(conversationId) || isCallMuted(conversationId),
    [isCallMuted, isMessageMuted]
  );

  /* Ref-based mute checks for use inside long-lived event-handler closures.
     These always read the latest notificationPrefs without needing the
     effect to re-run. */
  const isMessageMutedLive = useCallback((conversationId) => {
    const aliases = getConversationAliases(conversationId);
    const prefs = aliases.reduce(
      (p, key) => ({ ...p, ...(notificationPrefsRef.current?.[key] || {}) }),
      { ...DEFAULT_CONVERSATION_PREFS }
    );
    return !!prefs.messages;
  }, [getConversationAliases]);

  const isCallMutedLive = useCallback((conversationId) => {
    const aliases = getConversationAliases(conversationId);
    const prefs = aliases.reduce(
      (p, key) => ({ ...p, ...(notificationPrefsRef.current?.[key] || {}) }),
      { ...DEFAULT_CONVERSATION_PREFS }
    );
    return !!prefs.calls;
  }, [getConversationAliases]);

  const toggleNotificationMute = useCallback((conversationId, type = "messages") => {
    if (!conversationId || !["messages", "calls"].includes(type)) return false;

    let nextMuted = false;
    updateNotificationPrefs((prev) => {
      const aliases = getConversationAliases(conversationId);
      const current = aliases.reduce(
        (prefs, key) => ({
          ...prefs,
          ...(prev?.[key] || {}),
        }),
        { ...DEFAULT_CONVERSATION_PREFS }
      );
      nextMuted = !current[type];
      const nextConversationPrefs = {
        ...current,
        [type]: nextMuted,
      };
      const next = {
        ...prev,
      };

      aliases.forEach((key) => {
        delete next[key];
      });

      if (!isDefaultConversationPrefs(nextConversationPrefs)) {
        next[conversationId] = nextConversationPrefs;
      }

      return next;
    });

    return nextMuted;
  }, [getConversationAliases, isDefaultConversationPrefs, updateNotificationPrefs]);

  const toggleConversationMute = useCallback(
    (conversationId) => toggleNotificationMute(conversationId, "messages"),
    [toggleNotificationMute]
  );

  const updateConversationCallSetting = useCallback((conversationId, key, value) => {
    if (!conversationId || !["ringtoneVolume", "vibrate"].includes(key)) return;

    updateNotificationPrefs((prev) => {
      const aliases = getConversationAliases(conversationId);
      const current = aliases.reduce(
        (prefs, alias) => ({
          ...prefs,
          ...(prev?.[alias] || {}),
        }),
        { ...DEFAULT_CONVERSATION_PREFS }
      );
      const nextConversationPrefs = {
        ...current,
        [key]: value,
      };
      const next = {
        ...prev,
      };

      aliases.forEach((alias) => {
        delete next[alias];
      });

      if (!isDefaultConversationPrefs(nextConversationPrefs)) {
        next[conversationId] = nextConversationPrefs;
      }

      return next;
    });
  }, [getConversationAliases, isDefaultConversationPrefs, updateNotificationPrefs]);

  const requestNotifPermission = useCallback(async () => {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    return result;
  }, []);

  /* Auto-request once when the user is logged in */
  useEffect(() => {
    if (!authUser) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then(setNotifPermission);
    }
  }, [authUser]);

  useEffect(() => {
    if (!shouldBootstrapStream || !tokenData?.token || !authUser || !streamApiKey) return;
    let isMounted = true;
    let scheduledSeed = null;

    const setup = async () => {
      try {
        const StreamChat = await getStreamChatClass();
        const client = StreamChat.getInstance(streamApiKey);

        /* Connect only once */
        const img = authUser.profilePic?.startsWith("data:")
          ? "" : authUser.profilePic || "";
        if (client.userID !== authUser._id) {
          await client.connectUser(
            { id: authUser._id, name: authUser.fullName, image: img },
            tokenData.token
          );
        } else if (img && client.user?.image !== img) {
          /* Profile pic changed after initial connect — push it to Stream */
          client.partialUpdateUser({ id: authUser._id, set: { image: img } }).catch(() => { });
        }

        /* Cache own image so SlackMessage always resolves it */
        setUserImageCache(authUser._id, authUser.profilePic);
        upsertPresenceUsers([{ id: authUser._id, name: authUser.fullName, image: img, online: true }]);

        if (!isMounted) return;

        /* ── shared handler ──────────────────────────── */
        const handleMsg = (channelId, sender, message, notif = false, eventUnreadCount = undefined) => {
          if (sender) {
            upsertPresenceUsers([{ ...sender, online: true, last_active: new Date().toISOString() }]);
          }

          const selfId = selfIdRef.current;
          const partnerId = extractPartnerId(channelId, selfId);
          if (!partnerId) return;

          const isFromSelf = sender?.id === selfId;
          const isActiveChat = window.location.pathname.includes(partnerId);

          /* For incoming messages, the sender IS the partner (unless it's from self) */
          const partnerInfo = isFromSelf ? null : sender;

          /* Toast + browser notification only for incoming messages when not on that chat */
          if (!isFromSelf && !isActiveChat && !isMessageMutedLive(channelId)) {
            const senderName = sender?.name || "Someone";
            const txt = msgPreview(message) || "New message";

            toast.custom(
              (t) => (
                <MsgToast
                  t={t}
                  avatar={sanitizeStreamImage(sender?.image)}
                  senderName={senderName}
                  text={txt}
                  partnerId={partnerId}
                />
              ),
              { duration: 4500, position: "bottom-right", id: `dm-${channelId}` }
            );

            /* Browser notification — only when the tab is hidden/blurred */
            if ("Notification" in window && Notification.permission === "granted" && document.visibilityState === "hidden") {
              try {
                const n = new Notification(senderName, {
                  body: txt,
                  icon: sanitizeStreamImage(sender?.image) || "/favicon.ico",
                  tag: `dm-${partnerId}`,   // collapses multiple messages from same person
                  renotify: true,
                });
                n.onclick = () => {
                  window.focus();
                  window.location.href = `/chat/${partnerId}`;
                  n.close();
                };
              } catch (_) { /* some browsers block even after permission */ }
            }
          }

          // Fetch exact unread count from the active channel stream structure if available
          const cid = `messaging:${channelId}`;
          const activeChannel = client.activeChannels?.[cid];
          // countUnread() is only reliable AFTER the SDK has processed the event.
          // Use it as a cross-check but fall back to prev+1 if it returns 0 unexpectedly.
          const sdkCount = activeChannel && typeof activeChannel.countUnread === 'function'
            ? activeChannel.countUnread()
            : undefined;

          setDmMeta((prev) => {
            let nextUnread;
            if (isActiveChat || isFromSelf) {
              nextUnread = 0;
            } else if (sdkCount !== undefined && sdkCount > 0) {
              // SDK gave us a positive value — trust it
              nextUnread = sdkCount;
            } else {
              // SDK returned 0 or unavailable — safe increment
              nextUnread = (prev[partnerId]?.unread ?? 0) + 1;
            }

            return {
              ...prev,
              [partnerId]: {
                channelId,
                unread: nextUnread,
                lastMsg: msgPreview(message),
                lastMsgAt: message?.created_at || new Date().toISOString(),
                lastMsgSenderId: sender?.id || null,
                partnerName: partnerInfo?.name || prev[partnerId]?.partnerName || partnerId,
                partnerImage: sanitizeStreamImage(partnerInfo?.image) || prev[partnerId]?.partnerImage || "",
              },
            };
          });
        };

        /* ── message.new  (watched channels) ─────────── */
        const onMessageNew = (event) => {
          if (event.channel_type !== "messaging") return;
          handleMsg(event.channel_id, event.user, event.message, false, event.unread_messages);
        };

        /* ── notification.message_new  (un-watched / brand-new channels) ── */
        const onNotificationMessageNew = (event) => {
          if (event.channel_type !== "messaging") return;
          /* event.message.user is the sender in notification events */
          const sender = event.message?.user || event.user;
          handleMsg(event.channel_id, sender, event.message, true, event.unread_messages);
        };

        /* ── read receipts → reset unread only when WE read ─────────────── */
        const onMarkRead = (event) => {
          if (event.channel_type !== "messaging") return;
          // Only reset OUR unread — ignore read events from the other person
          if (event.user?.id !== selfIdRef.current) return;
          const partnerId = extractPartnerId(
            event.channel_id, selfIdRef.current
          );
          if (partnerId) {
            setDmMeta((prev) => ({
              ...prev,
              [partnerId]: { ...(prev[partnerId] || {}), unread: 0 },
            }));
          }
        };

        /* ── notification.mark_unread ── */
        const onMarkUnread = (event) => {
          if (event.channel_type !== "messaging") return;
          const partnerId = extractPartnerId(
            event.channel_id, selfIdRef.current
          );
          if (partnerId) {
            const cid = `messaging:${event.channel_id}`;
            const activeChannel = client.activeChannels?.[cid];

            setDmMeta((prev) => {
              const exactUnread = activeChannel && typeof activeChannel.countUnread === 'function'
                ? activeChannel.countUnread()
                : (event.unread_messages ?? prev[partnerId]?.unread ?? 0);

              return {
                ...prev,
                [partnerId]: { ...(prev[partnerId] || {}), unread: Math.max(0, exactUnread) },
              };
            });
          }
        };

        client.on("message.new", onMessageNew);
        client.on("notification.message_new", onNotificationMessageNew);
        client.on("message.read", onMarkRead);
        client.on("notification.mark_read", onMarkRead);
        client.on("notification.mark_unread", onMarkUnread);

        /* ── team (org) channel unread tracking ── */
        const onTeamMessageNew = (event) => {
          if (event.channel_type !== "team") return;
          if (event.user?.id === selfIdRef.current) return;
          const isActive = window.location.pathname.includes(event.channel_id);
          setChannelMeta((prev) => ({
            ...prev,
            [event.channel_id]: {
              ...(prev[event.channel_id] || {}),
              unread: isActive ? 0 : (prev[event.channel_id]?.unread ?? 0) + 1,
              lastMsg: msgPreview(event.message),
              lastMsgAt: event.message?.created_at || new Date().toISOString(),
            },
          }));
        };

        const onTeamChannelRead = (event) => {
          if (event.channel_type !== "team") return;
          if (event.user?.id !== selfIdRef.current) return;
          setChannelMeta((prev) => ({
            ...prev,
            [event.channel_id]: { ...(prev[event.channel_id] || {}), unread: 0 },
          }));
        };

        client.on("message.new", onTeamMessageNew);
        client.on("message.read", onTeamChannelRead);
        client.on("notification.mark_read", onTeamChannelRead);

        const onPresenceChanged = (event) => {
          const changedUser = event.user || event.me || event.member?.user;
          if (changedUser) upsertPresenceUsers([changedUser]);
        };

        const onUserUpdated = (event) => {
          const updatedUser = event.user;
          if (updatedUser) upsertPresenceUsers([updatedUser]);
        };

        const onUserActive = (event) => {
          const activeUser = event.user;
          if (activeUser) {
            upsertPresenceUsers([{ ...activeUser, online: true, last_active: new Date().toISOString() }]);
          }
        };

        client.on("user.presence.changed", onPresenceChanged);
        client.on("user.updated", onUserUpdated);
        client.on("typing.start", onUserActive);

        const seedExistingChannels = async () => {
          try {
            const channels = await client.queryChannels(
              { type: "messaging", members: { $in: [authUser._id] } },
              [{ last_message_at: -1 }],
              { watch: true, state: true, limit: 30, message_limit: 1 }
            );

            if (isMounted) {
              const meta = {};
              for (const ch of channels) {
                const partnerId = extractPartnerId(ch.id, authUser._id);
                if (!partnerId) continue;

                const members = Object.values(ch.state.members || {});
                const partnerMember = members.find((m) => m.user_id !== authUser._id);
                const partnerUser = partnerMember?.user;
                if (partnerUser) upsertPresenceUsers([partnerUser]);

                const last = typeof ch.lastMessage === "function"
                  ? ch.lastMessage()
                  : ch.state.messages[ch.state.messages.length - 1];

                meta[partnerId] = {
                  channelId: ch.id,
                  unread: ch.countUnread() || 0,
                  lastMsg: msgPreview(last),
                  lastMsgAt: last?.created_at || ch.data?.last_message_at || null,
                  lastMsgSenderId: last?.user?.id || null,
                  partnerName: partnerUser?.name || partnerUser?.id || "Unknown",
                  partnerImage: sanitizeStreamImage(partnerUser?.image) || "",
                };
              }
              setDmMeta(meta);
            }
          } catch (qErr) {
            console.warn("[StreamContext] queryChannels failed:", qErr);
          }

          // Seed unread for org (team) channels
          try {
            const teamChannels = await client.queryChannels(
              { type: "team", members: { $in: [authUser._id] } },
              [{ last_message_at: -1 }],
              { watch: true, state: true, limit: 20, message_limit: 1 }
            );
            if (isMounted) {
              const chMeta = {};
              for (const ch of teamChannels) {
                const last = typeof ch.lastMessage === "function"
                  ? ch.lastMessage()
                  : ch.state.messages?.[ch.state.messages.length - 1];
                chMeta[ch.id] = {
                  unread: ch.countUnread() || 0,
                  lastMsg: msgPreview(last),
                  lastMsgAt: last?.created_at || ch.data?.last_message_at || null,
                };
              }
              setChannelMeta(chMeta);
            }
          } catch (chErr) {
            console.warn("[StreamContext] team queryChannels failed:", chErr);
          }
        };

        if (typeof window.requestIdleCallback === "function") {
          scheduledSeed = window.requestIdleCallback(() => {
            scheduledSeed = null;
            seedExistingChannels();
          }, { timeout: 1200 });
        } else {
          scheduledSeed = window.setTimeout(() => {
            scheduledSeed = null;
            seedExistingChannels();
          }, 250);
        }

        cleanupRef.current = () => {
          if (scheduledSeed) {
            if (typeof window.cancelIdleCallback === "function") {
              window.cancelIdleCallback(scheduledSeed);
            } else {
              window.clearTimeout(scheduledSeed);
            }
            scheduledSeed = null;
          }
          client.off("message.new", onMessageNew);
          client.off("notification.message_new", onNotificationMessageNew);
          client.off("message.read", onMarkRead);
          client.off("notification.mark_read", onMarkRead);
          client.off("notification.mark_unread", onMarkUnread);
                    client.off("message.new", onTeamMessageNew);
                    client.off("message.read", onTeamChannelRead);
                    client.off("notification.mark_read", onTeamChannelRead);
          client.off("user.presence.changed", onPresenceChanged);
          client.off("user.updated", onUserUpdated);
          client.off("typing.start", onUserActive);
        };
      } catch (err) {
        console.error("[StreamContext] setup error:", err);
      }
    };

    setup();

    return () => {
      isMounted = false;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [authUser, shouldBootstrapStream, tokenData, streamApiKey]);

  const markAsRead = useCallback(async (partnerId) => {
    setDmMeta((prev) => ({
      ...prev,
      [partnerId]: { ...(prev[partnerId] || {}), unread: 0 },
    }));

    // Also tell Stream to mark it as read for sync across devices
    try {
      const StreamChat = await getStreamChatClass();
      if (!streamApiKey) return;
      const client = StreamChat.getInstance(streamApiKey);
      const selfId = selfIdRef.current;
      if (!selfId || !partnerId) return;

      const channelId = [selfId, partnerId].sort().join("-");
      const cid = `messaging:${channelId}`;
      const activeChannel = client.activeChannels?.[cid];
      const channel = activeChannel || client.channel("messaging", channelId, {
        members: [selfId, partnerId],
      });

      try {
        await channel.markRead();
      } catch (err) {
        if (!/hasn't been initialized yet/i.test(String(err?.message || ""))) {
          throw err;
        }

        await channel.watch();
        await channel.markRead();
      }
    } catch (err) {
      console.warn("[StreamContext] Failed to mark channel as read in SDK:", err);
    }
  }, [streamApiKey]);

  const markOrgChannelAsRead = useCallback(async (channelId) => {
    if (!channelId) return;
    setChannelMeta((prev) => ({
      ...prev,
      [channelId]: { ...(prev[channelId] || {}), unread: 0 },
    }));
    try {
      const StreamChat = await getStreamChatClass();
      if (!streamApiKey) return;
      const client = StreamChat.getInstance(streamApiKey);
      if (!client?.userID) return;
      const cid = `team:${channelId}`;
      const ch = client.activeChannels?.[cid] || client.channel("team", channelId);
      await ch.markRead();
    } catch (err) {
      console.warn("[StreamContext] Failed to mark team channel as read:", err);
    }
  }, [streamApiKey]);

  return (
    <StreamContext.Provider value={{ dmMeta, channelMeta, presenceById, getUserPresence, refreshUserPresence, markAsRead, markOrgChannelAsRead, notifPermission, requestNotifPermission, notificationPrefs, getConversationPrefs, isConversationMuted, isMessageMuted, isCallMuted, isMessageMutedLive, isCallMutedLive, toggleConversationMute, toggleNotificationMute, updateConversationCallSetting }}>
      {children}
    </StreamContext.Provider>
  );
};

export const useStreamContext = () =>
  useContext(StreamContext) ?? {
    dmMeta: {},
      channelMeta: {},
    presenceById: {},
    getUserPresence: (_, fallbackUser = null) => fallbackUser,
    refreshUserPresence: async () => [],
    markAsRead: () => { },
      markOrgChannelAsRead: async () => { },
    notifPermission: "unsupported",
    requestNotifPermission: async () => { },
    notificationPrefs: {},
    getConversationPrefs: () => DEFAULT_CONVERSATION_PREFS,
    isConversationMuted: () => false,
    isMessageMuted: () => false,
    isCallMuted: () => false,
    isMessageMutedLive: () => false,
    isCallMutedLive: () => false,
    toggleConversationMute: () => false,
    toggleNotificationMute: () => false,
    updateConversationCallSetting: () => { },
  };

