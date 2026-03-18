import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { StreamVideoClient } from '@stream-io/video-react-sdk';
import { useQuery } from '@tanstack/react-query';
import useAuthUser from '../hooks/useAuthUser';
import { getStreamToken } from '../lib/api';
import { useStreamContext } from '../context/StreamContext';
import IncomingCallNotification from './IncomingCallNotification';
import VideoCallModal from './VideoCallModal';
import { removeActiveCall, saveCallLog, updateCallLog, upsertActiveCall } from '../lib/callHistory';

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const inferIsChannelCall = (conversationId, explicitFlag) => {
  if (typeof explicitFlag === 'boolean') return explicitFlag;
  const id = String(conversationId || '');
  if (!id) return false;
  if (id.includes('!members-')) return false;
  return id.includes(':');
};

const pickImageFromUser = (user) => {
  if (!user || typeof user !== 'object') return '';
  return user.image || user.profilePic || user.image_url || user.avatar_url || '';
};

/**
 * Mounts once at the app level (inside StreamProvider) and listens for
 * incoming call events regardless of which page the user is on.
 */
const GlobalVideoCallHandler = () => {
  const { authUser } = useAuthUser();
  const navigate = useNavigate();
  const { isCallMutedLive, getConversationPrefs } = useStreamContext();

  const { data: tokenData } = useQuery({
    queryKey: ['streamToken'],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });
  const streamApiKey = tokenData?.apiKey || STREAM_API_KEY;

  const [incomingCall, setIncomingCall] = useState(null);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [callInfo, setCallInfo] = useState(null);

  const activeIncomingCallIdRef = useRef(null);
  const lastRingEventAtRef = useRef({});
  const mutedIncomingCallRef = useRef(null);
  const incomingCallRef = useRef(null);
  const videoClientRef = useRef(null);
  // Stable ref so the event handler always reads the latest version
  const isCallMutedLiveRef = useRef(isCallMutedLive);
  useEffect(() => { isCallMutedLiveRef.current = isCallMutedLive; }, [isCallMutedLive]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);

  const buildIncomingCallFromEvent = (event) => {
    const callCid = event?.call_cid || event?.call?.cid || null;
    const callId = event?.call?.id || (callCid ? callCid.split(':')[1] : null) || callCid;
    if (!callId) return null;

    const members = Array.isArray(event.members)
      ? event.members
      : Array.isArray(event.call?.members)
      ? event.call.members
      : [];
    const createdBy = event.call?.created_by || event.created_by || null;
    const creator = createdBy?.id ? createdBy : (event.user?.id ? event.user : null);
    const callerUserId = creator?.id || null;
    const callerMember = callerUserId
      ? members.find((member) => member.user_id === callerUserId)
      : null;
    const firstOtherMember = members.find((member) => member?.user_id && member.user_id !== authUser._id) || null;

    if (callerUserId && callerUserId === authUser._id) return null;

    const conversationId = event.call?.custom?.conversationId || (callerUserId
      ? [authUser._id, callerUserId].sort().join('-')
      : null);

    const participantIds = members.map((m) => m.user_id).filter(Boolean);
    const participantNames = members
      .filter((m) => m.user_id !== authUser._id)
      .map((m) => m.user?.name || m.user_id)
      .filter(Boolean);
    const participantProfiles = members.map((member) => ({
      id: member.user_id,
      name: member.user?.name || member.user_id,
      image: pickImageFromUser(member.user),
      isYou: member.user_id === authUser._id,
    }));

    return {
      callId,
      callerName: callerMember?.user?.name || creator?.name || createdBy?.name || event.user?.name || 'Someone',
      callerImage:
        pickImageFromUser(callerMember?.user) ||
        pickImageFromUser(creator) ||
        pickImageFromUser(createdBy) ||
        pickImageFromUser(event.user) ||
        pickImageFromUser(firstOtherMember?.user) ||
        participantProfiles.find((profile) => profile.id !== authUser._id)?.image ||
        '',
      type: event.call?.custom?.callType || ((event.video ?? event.call?.video) ? 'video' : 'audio'),
      conversationId,
      callerUserId,
      participantIds,
      participantNames,
      participantProfiles,
      startedAt: event.created_at || new Date().toISOString(),
      isChannel: inferIsChannelCall(conversationId, event.call?.custom?.isChannel),
      conversationName: event.call?.custom?.conversationName || '',
    };
  };

  useEffect(() => {
    if (!authUser || !tokenData?.token || !streamApiKey) return;

    const videoClient = StreamVideoClient.getOrCreateInstance({
      apiKey: streamApiKey,
      user: {
        id: authUser._id,
        name: authUser.fullName,
        image: authUser.profilePic?.startsWith('data:') ? '' : authUser.profilePic || '',
      },
      token: tokenData.token,
    });
    videoClientRef.current = videoClient;

    const handleIncomingRingEvent = (event) => {
      console.log("[GlobalVideoCallHandler] Received ring/notification event:", event.type, event.call_cid);
      const nextIncomingCall = buildIncomingCallFromEvent(event);
      if (!nextIncomingCall) return;

      // Deduplicate only near-identical bursts; allow re-rings for the same call ID.
      const now = Date.now();
      const lastAt = lastRingEventAtRef.current[nextIncomingCall.callId] || 0;
      if (activeIncomingCallIdRef.current === nextIncomingCall.callId && now - lastAt < 2500) return;
      lastRingEventAtRef.current[nextIncomingCall.callId] = now;
      activeIncomingCallIdRef.current = nextIncomingCall.callId;

      // Respect per-conversation call mute preference
      if (isCallMutedLiveRef.current?.(nextIncomingCall.conversationId)) {
        mutedIncomingCallRef.current = nextIncomingCall;
        upsertActiveCall({
          callId: nextIncomingCall.callId,
          conversationId: nextIncomingCall.conversationId,
          type: nextIncomingCall.type,
          participantIds: nextIncomingCall.participantIds,
          participantNames: nextIncomingCall.participantNames,
          participantProfiles: nextIncomingCall.participantProfiles,
          startedAt: nextIncomingCall.startedAt,
          status: 'ringing',
        });
        return;
      }

      upsertActiveCall({
        callId: nextIncomingCall.callId,
        conversationId: nextIncomingCall.conversationId,
        type: nextIncomingCall.type,
        participantIds: nextIncomingCall.participantIds,
        participantNames: nextIncomingCall.participantNames,
        participantProfiles: nextIncomingCall.participantProfiles,
        startedAt: nextIncomingCall.startedAt,
        status: 'ringing',
      });

      setIncomingCall(nextIncomingCall);

      // Browser notification when tab is hidden
      if (Notification.permission === 'granted' && document.visibilityState === 'hidden') {
        try {
          const n = new Notification(`${nextIncomingCall.callerName} is calling`, {
            body: nextIncomingCall.type === 'video' ? 'Incoming video call' : 'Incoming audio call',
            icon: nextIncomingCall.callerImage || '/favicon.ico',
            tag: `call-${nextIncomingCall.callId}`,
            renotify: true,
          });
          n.onclick = () => {
            window.focus();
            if (nextIncomingCall.callerUserId) navigate(`/chat/${nextIncomingCall.callerUserId}`);
            n.close();
          };
        } catch (_) { /* ignore */ }
      }
    };

    const unsubscribeRing = videoClient.on('call.ring', handleIncomingRingEvent);
    const unsubscribeNotification = videoClient.on('call.notification', handleIncomingRingEvent);
    const unsubscribeCreated = videoClient.on('call.created', handleIncomingRingEvent);
    const unsubscribeMemberJoined = videoClient.on('call.member_added', handleIncomingRingEvent);

    const handleCallMissedEvent = (event) => {
      console.log("[GlobalVideoCallHandler] Received call.missed event:", event.call?.id);
      const id = event.call?.id || event.call_cid?.split(':')[1];
      if (id && activeIncomingCallIdRef.current === id) {
        setIncomingCall(null);
        activeIncomingCallIdRef.current = null;
        delete lastRingEventAtRef.current[id];
        mutedIncomingCallRef.current = null;
        removeActiveCall(id);
      }
    };
    const unsubscribeMissed = videoClient.on('call.missed', handleCallMissedEvent);

    const logMissedCall = async (endedCallId) => {
      const current = incomingCallRef.current;
      const loggedCall =
        current?.callId === endedCallId
          ? current
          : mutedIncomingCallRef.current?.callId === endedCallId
          ? mutedIncomingCallRef.current
          : null;
      if (loggedCall) {
        await saveCallLog({
          callId: endedCallId,
          conversationId: loggedCall.conversationId,
          type: loggedCall.type,
          startTime: loggedCall.startedAt || new Date().toISOString(),
          participants: loggedCall.participantNames?.length
            ? loggedCall.participantNames
            : [loggedCall.callerName],
          participantIds: loggedCall.participantIds || [],
          participantProfiles: loggedCall.participantProfiles || [],
          hostId: loggedCall.callerUserId || null,
          conversationName: loggedCall.conversationName || '',
          status: 'missed',
          isChannel: loggedCall.isChannel,
        });
        removeActiveCall(endedCallId);
      }
    };

    const unsubscribeReject = videoClient.on('call.rejected', (event) => {
      const id = event.call?.id || event.call_cid?.split(':')[1];
      if (id && activeIncomingCallIdRef.current === id) {
        logMissedCall(id);
        activeIncomingCallIdRef.current = null;
        delete lastRingEventAtRef.current[id];
        mutedIncomingCallRef.current = null;
        setIncomingCall(null);
      }
    });

    const unsubscribeAccept = videoClient.on('call.accepted', (event) => {
      const id = event.call?.id || event.call_cid?.split(':')[1];
      if (id && activeIncomingCallIdRef.current === id) {
        activeIncomingCallIdRef.current = null;
        delete lastRingEventAtRef.current[id];
        mutedIncomingCallRef.current = null;
      }
    });

    const unsubscribeEnd = videoClient.on('call.ended', async (event) => {
      const id = event.call?.id || event.call_cid?.split(':')[1];
      console.log("[GlobalVideoCallHandler] Received call.ended event:", id);
      if (id) {
        await updateCallLog(id, { endTime: new Date().toISOString(), status: 'ended' });
        removeActiveCall(id);
      }
      if (id && activeIncomingCallIdRef.current === id) {
        logMissedCall(id);
        activeIncomingCallIdRef.current = null;
        delete lastRingEventAtRef.current[id];
        mutedIncomingCallRef.current = null;
        setIncomingCall(null);
      }
    });

    return () => {
      unsubscribeRing?.();
      unsubscribeNotification?.();
      unsubscribeCreated?.();
      unsubscribeMemberJoined?.();
      unsubscribeMissed?.();
      unsubscribeReject?.();
      unsubscribeAccept?.();
      unsubscribeEnd?.();
      // NOTE: We don't disconnect the user here to avoid signaling gaps during token refreshes.
      // The client instance is managed by StreamVideoClient.getOrCreateInstance.
    };
  }, [authUser, tokenData, navigate, streamApiKey]);

  const handleAccept = () => {
    if (!incomingCall) return;
    const accepted = incomingCall;
    activeIncomingCallIdRef.current = null;
    delete lastRingEventAtRef.current[accepted.callId];
    setIncomingCall(null);

    setCallInfo({
      callId: accepted.callId,
      conversationId: accepted.conversationId,
      participantIds: accepted.participantIds || [],
      participantNames: accepted.participantNames?.length
        ? accepted.participantNames
        : [accepted.callerName],
      participantProfiles: accepted.participantProfiles || [],
      callType: accepted.type || 'video',
      callerUserId: accepted.callerUserId,
      isChannel: accepted.isChannel,
      conversationName: accepted.conversationName || '',
    });
    setShowVideoCall(true);

    // Navigate to the correct chat so the user is in context after the call
    if (accepted.conversationId && !accepted.conversationId.includes(authUser._id)) {
      navigate(`/chat/${accepted.conversationId}`);
    } else if (accepted.callerUserId) {
      navigate(`/chat/${accepted.callerUserId}`);
    }
  };

  const handleDecline = async () => {
    if (!incomingCall) return;
    const declined = incomingCall;
    activeIncomingCallIdRef.current = null;
    delete lastRingEventAtRef.current[declined.callId];
    setIncomingCall(null);

    try {
      if (videoClientRef.current && declined.callId) {
        const rejectedCall = videoClientRef.current.call('default', declined.callId);
        await rejectedCall.reject('decline');
      }
    } catch (err) {
      console.error('Error declining call:', err);
    }

    await saveCallLog({
      callId: declined.callId,
      conversationId: declined.conversationId,
      type: declined.type,
      startTime: declined.startedAt || new Date().toISOString(),
      participants: declined.participantNames?.length
        ? declined.participantNames
        : [declined.callerName],
      participantIds: declined.participantIds || [],
      participantProfiles: declined.participantProfiles || [],
      hostId: declined.callerUserId || null,
      conversationName: declined.conversationName || '',
      status: 'missed',
      isChannel: declined.isChannel,
    });
    removeActiveCall(declined.callId);
  };

  const callPrefs = incomingCall
    ? getConversationPrefs(incomingCall.conversationId)
    : { ringtoneVolume: 0.6, vibrate: true };

  if (!authUser || !tokenData?.token || !streamApiKey) return null;

  return (
    <>
      <IncomingCallNotification
        isOpen={!!incomingCall}
        onAccept={handleAccept}
        onDecline={handleDecline}
        callerName={incomingCall?.callerName || ''}
        callerImage={incomingCall?.callerImage || ''}
        callType={incomingCall?.type || 'video'}
        ringtoneVolume={callPrefs.ringtoneVolume}
        vibrate={callPrefs.vibrate}
      />
      {callInfo && (
        <VideoCallModal
          isOpen={showVideoCall}
          onClose={() => {
            setShowVideoCall(false);
            setCallInfo(null);
          }}
          callId={callInfo.callId}
          apiKey={streamApiKey}
          token={tokenData.token}
          user={authUser}
          isInitiator={false}
          participantIds={callInfo.participantIds}
          participantNames={callInfo.participantNames}
          participantProfiles={callInfo.participantProfiles}
          callType={callInfo.callType}
          conversationId={callInfo.conversationId}
          callerUserId={callInfo.callerUserId}
          isChannel={callInfo.isChannel}
          conversationName={callInfo.conversationName || ''}
        />
      )}
    </>
  );
};

export default GlobalVideoCallHandler;
