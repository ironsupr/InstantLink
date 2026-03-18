import { useEffect, useState } from "react";
import "stream-chat-react/dist/css/v2/index.css";
import { useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useQuery } from "@tanstack/react-query";
import { getStreamToken, ensureOrgChannel } from "../lib/api";
import Avatar from "../components/Avatar";
import { setUserImageCache, getUserImage } from "../lib/userImageCache";
import { useStreamContext } from "../context/StreamContext";
import { getActiveCallByConversation, isCallOngoing, subscribeToCallStore } from "../lib/callHistory";
import { getPresenceMeta } from "../lib/presenceUtils";

import {
  Channel,
  Chat,
  MessageInput,
  MessageList,
  Thread,
  Window,
  TypingIndicator,
} from "stream-chat-react";
import { StreamChat } from "stream-chat";
import toast from "react-hot-toast";

import ChatLoader from "../components/ChatLoader";
import ChannelMembersPanel from "../components/ChannelMembersPanel";
import ChannelInfoPanel from "../components/ChannelInfoPanel";
import EmptyChannelState from "../components/EmptyChannelState";
import MessageSearch from "../components/MessageSearch";
import ConnectionStatus from "../components/ConnectionStatus";
import VideoCallModal from "../components/VideoCallModal";
import CallLogsPanel from "../components/CallLogsPanel";
import {
  HistoryIcon,
  PhoneIcon,
  VideoIcon,
  BellOffIcon,
  HashIcon,
  SearchIcon,
  UsersIcon,
  MoreVerticalIcon,
} from "lucide-react";

import PremiumMessage from "../components/PremiumMessage";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const FullScreenChatPage = () => {
  const { id: channelOrUserId } = useParams();

  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isChannel, setIsChannel] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activeConversationCall, setActiveConversationCall] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [callId, setCallId] = useState(null);
  const [callParticipantIds, setCallParticipantIds] = useState([]);
  const [callParticipantNames, setCallParticipantNames] = useState([]);
  const [callParticipantProfiles, setCallParticipantProfiles] = useState([]);
  const [callType, setCallType] = useState("video");
  const [isInitiatingCall, setIsInitiatingCall] = useState(false);
  const [showCallLogs, setShowCallLogs] = useState(false);

  const { authUser } = useAuthUser();
  const { markAsRead, markOrgChannelAsRead, isMessageMuted, isCallMuted, getUserPresence, refreshUserPresence } = useStreamContext();

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
    // Token is long-lived — don't refetch on every mount; this lets initChat
    // start immediately on subsequent channel navigations.
    staleTime: 30 * 60 * 1000,
  });
  const streamApiKey = tokenData?.apiKey || STREAM_API_KEY;

  useEffect(() => {
    let cancelled = false;

    // Immediately show loader and clear stale channel whenever the target changes
    setLoading(true);
    setChannel(null);
    setShowSearch(false);

    const initChat = async () => {
      // If token or user aren't ready yet, keep the loader spinning.
      // The effect will re-run when tokenData / authUser populate.
      if (!tokenData?.token || !authUser || !streamApiKey) return;

      try {
        const client = StreamChat.getInstance(streamApiKey);

        // Only (re)connect if not already connected as this user
        if (client.userID !== authUser._id) {
          const streamImage = authUser.profilePic?.startsWith("data:") ? "" : authUser.profilePic || "";
          await client.connectUser(
            {
              id: authUser._id,
              name: authUser.fullName,
              image: streamImage,
            },
            tokenData.token
          );
          setUserImageCache(authUser._id, authUser.profilePic);
        }

        let currChannel;
        const predefinedChannels = ["general", "marketing", "development"];
        const isOrgChannel = channelOrUserId.startsWith("org-");

        if (isOrgChannel || predefinedChannels.includes(channelOrUserId)) {
          if (!cancelled) setIsChannel(true);

          if (isOrgChannel) {
            currChannel = client.channel("team", channelOrUserId);

            // Optimistically try to watch first — avoids the backend round-trip
            // for channels the user is already a member of.
            try {
              await currChannel.watch();
            } catch {
              // Not a member yet: ask the backend to create/add us, then retry.
              await ensureOrgChannel(channelOrUserId);
                          markOrgChannelAsRead(channelOrUserId);
              await currChannel.watch();
            }
          } else {
            // Legacy hard-coded channel names — collapse create+addMembers+watch
            // into a single query that creates-or-gets in one round-trip.
            currChannel = client.channel("team", channelOrUserId, {
              name: `#${channelOrUserId}`,
              created_by_id: authUser._id,
            });
            await currChannel.watch();
            // Best-effort member add (no-op if already a member).
            currChannel.addMembers([authUser._id]).catch(() => {});
          }
        } else {
          if (!cancelled) setIsChannel(false);
          const channelId = [authUser._id, channelOrUserId].sort().join("-");

          // StreamContext already watches all DM channels at boot via queryChannels.
          // Reuse that cached channel object so we can render instantly without
          // an extra network round-trip.
          const cid = `messaging:${channelId}`;
          const cached = client.activeChannels?.[cid];

          if (cached) {
            // Render immediately from cache.
            if (!cancelled) {
              setChatClient(client);
              setChannel(cached);
              setLoading(false);
              markAsRead(channelOrUserId);
            }
            // Background refresh to catch any messages received while away.
            cached.watch().catch(() => {});
            return;
          }

          // Channel not cached yet (first DM ever) — normal watch path.
          currChannel = client.channel("messaging", channelId, {
            members: [authUser._id, channelOrUserId],
          });
          await currChannel.watch();
        }

        if (!cancelled) {
          setChatClient(client);
          setChannel(currChannel);
          if (!isOrgChannel && !predefinedChannels.includes(channelOrUserId)) {
            markAsRead(channelOrUserId);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error initializing chat:", error);
          toast.error("Could not connect to chat. Please try again.");
        }
      }

      // Only clear loading after real work was attempted (not on the early
      // return when token/user aren't available yet).
      if (!cancelled) setLoading(false);
    };

    initChat();

    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
      }

      if (e.key === "Escape") {
        setShowSearch(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleKeyDown);
      // NOTE: do NOT disconnect here — disconnecting on every channel switch
      // tears down the Stream WS connection and causes a blank screen race.
      // Disconnection is handled by the unmount-only effect below.
    };
  }, [tokenData, authUser, channelOrUserId, streamApiKey]);

  const conversationId = channel?.id || channelOrUserId;

  useEffect(() => {
    if (!conversationId) return undefined;

    const refresh = () => setActiveConversationCall(getActiveCallByConversation(conversationId));
    refresh();

    return subscribeToCallStore(refresh);
  }, [conversationId]);

  useEffect(() => {
    const memberIds = Object.values(channel?.state?.members || {}).map((member) => member.user_id).filter(Boolean);
    if (!memberIds.length) return;
    refreshUserPresence(memberIds);
  }, [channel?.id, channel?.state?.members, refreshUserPresence]);

  // Call timer
  useEffect(() => {
    let interval;
    if (isCallOngoing(activeConversationCall) && activeConversationCall?.startedAt) {
      const syncDuration = () => {
        setCallDuration(Math.max(0, Math.floor((Date.now() - new Date(activeConversationCall.startedAt).getTime()) / 1000)));
      };
      syncDuration();
      interval = setInterval(syncDuration, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeConversationCall]);

  if (loading || !chatClient || !channel) return <ChatLoader />;

  // ── Derived values ──────────────────────────────
  const memberCount = Object.keys(channel.state.members || {}).length;
  const memberList = Object.values(channel.state.members || {});
  const participantIds = Array.from(new Set(memberList.map((m) => m.user_id).filter(Boolean)));
  const participantNames = Array.from(
    new Set(
      memberList
        .filter((m) => m.user_id !== authUser._id)
        .map((m) => m.user?.name || m.user_id)
        .filter(Boolean)
    )
  );
  const participantProfiles = memberList.map((member) => ({
    id: member.user_id,
    name: member.user?.name || member.user_id,
    image: member.user_id === authUser._id
      ? authUser.profilePic
      : (getUserImage(member.user_id) || member.user?.image || member.user?.profilePic || ""),
    isYou: member.user_id === authUser._id,
  }));
  const dmPartnerMember = !isChannel
    ? memberList.find((m) => m.user_id !== authUser._id)
    : null;
  const dmPartner = !isChannel
    ? getUserPresence(dmPartnerMember?.user_id, dmPartnerMember?.user)
    : null;
  const dmPartnerPresence = getPresenceMeta(dmPartner);

  const rawChannelName = channel.data?.name || channelOrUserId;
  const displayName = isChannel
    ? rawChannelName.replace(/^#/, "")
    : dmPartner?.name || "Direct Message";
  const messagesMuted = isMessageMuted(channel?.id);
  const callsMuted = isCallMuted(channel?.id);
  const mutedBadgeLabel = messagesMuted && callsMuted
    ? "Muted"
    : messagesMuted
      ? "Messages muted"
      : callsMuted
        ? "Calls muted"
        : null;
  const subtitleLabel = isChannel
    ? `${memberCount} members`
    : dmPartnerPresence.label;

  const headerMembers = memberList.slice(0, 3);
  const extraCount = Math.max(0, memberCount - 3);

  return (
    <div className="mac-chat-shell h-full flex flex-col overflow-hidden relative">
      {/* Immersive background decoration */}
      <div className="absolute top-0 right-0 w-[420px] h-[420px] bg-sky-300/20 rounded-full blur-[120px] -mr-40 -mt-20 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[340px] h-[340px] bg-violet-200/20 rounded-full blur-[120px] -ml-24 -mb-24 pointer-events-none"></div>

      <ConnectionStatus chatClient={chatClient} />

      <Chat client={chatClient} theme="str-chat__theme-light">
        <Channel
          channel={channel}
          EmptyStateIndicator={() => (
            <EmptyChannelState
              isChannel={isChannel}
              channelName={channelOrUserId}
              userName={dmPartner?.name}
            />
          )}
        >
          <div className="mac-chat-frame flex flex-col h-full w-full">

            {/* ════════════════════════════════
                MODERN HEADER
            ════════════════════════════════ */}
            <div className="mac-chat-header flex-shrink-0 relative z-10">
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-4 min-w-0">
                  <button
                    type="button"
                    className="mac-chat-title min-w-0"
                    onClick={() => setShowInfo(true)}
                    aria-label={`Open conversation details for ${displayName}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isChannel && (
                        <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-primary/10 text-primary shadow-sm">
                          <HashIcon className="size-4 flex-shrink-0" strokeWidth={2.4} />
                        </div>
                      )}
                      <span className="font-semibold text-[17px] text-base-content leading-tight truncate">
                        {displayName}
                      </span>
                      {mutedBadgeLabel && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-base-200/80 px-2.5 py-1 text-[11px] font-semibold text-base-content/65 border border-base-300/70">
                          <BellOffIcon className="size-3.5" />
                          {mutedBadgeLabel}
                        </span>
                      )}
                    </div>

                    <span className="flex items-center gap-2 text-[13px] text-base-content/55 font-medium leading-tight mt-1.5 truncate">
                      {!isChannel && dmPartner && (
                        <span className={`inline-flex items-center gap-1.5 ${dmPartnerPresence.textClassName}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${dmPartnerPresence.dotClassName}`}></span>
                        </span>
                      )}
                      {subtitleLabel}
                    </span>
                  </button>
                </div>

                {/* Right: stacked avatars + action icons */}
                <div className="flex items-center gap-3 flex-shrink-0">

                  {/* Stacked member avatars (channel only) */}
                  {isChannel && headerMembers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowMembers(true)}
                      className="mac-member-stack group"
                      title="View members"
                      aria-label="Open member list"
                    >
                      <div className="flex -space-x-2.5 group-hover:-space-x-1.5 transition-all duration-300">
                        {headerMembers.map((m, i) => (
                          <Avatar
                            key={m.user_id || i}
                            src={getUserImage(m.user_id) || m.user?.image}
                            name={m.user?.name}
                            size="w-8 h-8"
                            className="border-2 border-white/90 shadow-sm"
                            style={{ zIndex: headerMembers.length - i }}
                          />
                        ))}
                      </div>
                      {extraCount > 0 && (
                        <span className="text-[13px] font-semibold ml-2 text-base-content/70 bg-base-100/85 px-2 py-0.5 rounded-full border border-base-300/70">
                          +{extraCount}
                        </span>
                      )}
                    </button>
                  )}

                  {/* Action buttons */}
                  <div className="mac-toolbar-group">
                    {isCallOngoing(activeConversationCall) ? (
                      <div className="mac-live-pill">
                        <span className="tabular-nums">
                          {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, "0")}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setCallId(activeConversationCall.callId);
                            setCallParticipantIds(activeConversationCall.participantIds?.length ? [authUser._id, ...activeConversationCall.participantIds.filter((id) => id !== authUser._id)] : participantIds);
                            setCallParticipantNames(activeConversationCall.participantNames?.length ? activeConversationCall.participantNames : participantNames);
                            setCallParticipantProfiles(activeConversationCall.participantProfiles?.length ? activeConversationCall.participantProfiles : participantProfiles);
                            setCallType(activeConversationCall.type || "video");
                            setIsInitiatingCall(false);
                            setShowVideoCall(true);
                          }}
                          className="btn btn-xs btn-success"
                        >
                          Rejoin
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          title="Start voice call"
                          aria-label="Start voice call"
                          onClick={() => {
                            if (participantIds.length < 2) {
                              toast.error("No other participants available for this call.");
                              return;
                            }

                            setCallId(`call-${channelOrUserId}-${Date.now()}`);
                            setCallParticipantIds(participantIds);
                            setCallParticipantNames(participantNames);
                            setCallParticipantProfiles(participantProfiles);
                            setCallType("audio");
                            setIsInitiatingCall(true);
                            setShowVideoCall(true);
                          }}
                          className="mac-toolbar-button"
                        >
                          <PhoneIcon className="size-[18px]" />
                        </button>

                        <button
                          type="button"
                          title="Start video call"
                          aria-label="Start video call"
                          onClick={() => {
                            if (participantIds.length < 2) {
                              toast.error("No other participants available for this call.");
                              return;
                            }

                            setCallId(`call-${channelOrUserId}-${Date.now()}`);
                            setCallParticipantIds(participantIds);
                            setCallParticipantNames(participantNames);
                            setCallParticipantProfiles(participantProfiles);
                            setCallType("video");
                            setIsInitiatingCall(true);
                            setShowVideoCall(true);
                          }}
                          className="mac-toolbar-button"
                        >
                          <VideoIcon className="size-[18px]" />
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      title="Search messages"
                      aria-label="Search messages"
                      onClick={() => setShowSearch((v) => !v)}
                      className={`mac-toolbar-button ${showSearch ? "bg-primary/12 text-primary shadow-sm" : ""}`}
                    >
                      <SearchIcon className="size-[18px]" />
                    </button>

                    <button
                      type="button"
                      title="Call history"
                      aria-label="Open call history"
                      onClick={() => setShowCallLogs(true)}
                      className="mac-toolbar-button"
                    >
                      <HistoryIcon className="size-[18px]" />
                    </button>

                    {isChannel && (
                      <button
                        type="button"
                        title="Members"
                        aria-label="Open members panel"
                        onClick={() => setShowMembers(true)}
                        className={`mac-toolbar-button ${showMembers ? "bg-primary/12 text-primary shadow-sm" : ""}`}
                      >
                        <UsersIcon className="size-[18px]" />
                      </button>
                    )}

                    <button
                      type="button"
                      title="Conversation info"
                      aria-label="Open conversation info"
                      onClick={() => setShowInfo(true)}
                      className={`mac-toolbar-button ${showInfo ? "bg-primary/12 text-primary shadow-sm" : ""}`}
                    >
                      <MoreVerticalIcon className="size-[18px]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ════════════════════════════════
                SEARCH OVERLAY
            ════════════════════════════════ */}
            {showSearch && (
              <MessageSearch
                channel={channel}
                onClose={() => setShowSearch(false)}
                onMessageSelect={(msg) => {
                  const el = document.querySelector(`[data-message-id="${msg.id}"]`);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    el.classList.add("highlight-message");
                    setTimeout(() => el.classList.remove("highlight-message"), 2000);
                  }
                }}
              />
            )}

            {/* ════════════════════════════════
                MESSAGES + INPUT
            ════════════════════════════════ */}
            <div className="mac-chat-content flex flex-1 min-h-0 overflow-hidden relative">
              <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                <Window>
                  <MessageList
                    Message={PremiumMessage}
                    messageActions={["edit", "delete", "reply", "react", "quote"]}
                    messageLimit={50}
                    hideDeletedMessages={false}
                    disableDateSeparator={false}
                  />


                  <div style={{ padding: "0 20px 2px" }}>
                    <TypingIndicator />
                  </div>

                  <div className="px-6 pb-6 pt-3 bg-transparent mt-auto relative z-20">
                    <div className="mac-composer-shell">
                      <MessageInput
                        focus
                        grow
                        maxRows={10}
                        additionalTextareaProps={{
                          placeholder: isChannel
                            ? `Message #${displayName}…`
                            : `Message ${displayName}…`,
                        }}
                      />
                    </div>
                  </div>
                </Window>
              </div>

              {/* Thread panel — uses SlackMessage for visual consistency */}
              <div className="mac-thread-wrapper">
                <Thread Message={PremiumMessage} autoFocus />
              </div>
            </div>

          </div>
        </Channel>
      </Chat>

      {/* ── Modals & Panels ── */}
      <ChannelMembersPanel channel={channel} isOpen={showMembers} onClose={() => setShowMembers(false)} />
      <ChannelInfoPanel channel={channel} isChannel={isChannel} isOpen={showInfo} onClose={() => setShowInfo(false)} />
      <VideoCallModal
        isOpen={showVideoCall}
        onClose={() => {
          setShowVideoCall(false);
          setCallParticipantIds([]);
          setCallParticipantNames([]);
          setCallParticipantProfiles([]);
          setCallType("video");
          setIsInitiatingCall(false);
        }}
        callId={callId}
        apiKey={streamApiKey}
        token={tokenData?.token}
        user={authUser}
        isInitiator={isInitiatingCall}
        participantIds={callParticipantIds}
        participantNames={callParticipantNames}
        participantProfiles={callParticipantProfiles}
        callType={callType}
        conversationId={conversationId}
        isChannel={isChannel}
        conversationName={displayName}
      />
      <CallLogsPanel
        isOpen={showCallLogs}
        onClose={() => setShowCallLogs(false)}
        conversationId={conversationId}
        onCallBack={(log) => {
          setCallId(`call-${channelOrUserId}-${Date.now()}`);
          setCallParticipantIds(log?.participantIds?.length ? [authUser._id, ...log.participantIds] : participantIds);
          setCallParticipantNames(log?.participants?.length ? log.participants : participantNames);
          setCallParticipantProfiles(log?.participantProfiles?.length ? log.participantProfiles : participantProfiles);
          setCallType(log?.type || "video");
          setIsInitiatingCall(true);
          setShowVideoCall(true);
        }}
        onRejoin={(log) => {
          setCallId(log.callId);
          setCallParticipantIds(log?.participantIds?.length ? [authUser._id, ...log.participantIds] : participantIds);
          setCallParticipantNames(log?.participants?.length ? log.participants : participantNames);
          setCallParticipantProfiles(log?.participantProfiles?.length ? log.participantProfiles : participantProfiles);
          setCallType(log?.type || "video");
          setIsInitiatingCall(false);
          setShowVideoCall(true);
        }}
      />
    </div>
  );
};

export default FullScreenChatPage;
