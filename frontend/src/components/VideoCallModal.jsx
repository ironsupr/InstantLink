import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OwnCapability, StreamVideoClient, StreamCall, StreamVideo, SpeakerLayout, useCallStateHooks, useToggleCallRecording } from '@stream-io/video-react-sdk';
import {
  DownloadIcon,
  FileTextIcon,
  InfoIcon,
  MessageSquareIcon,
  MonitorUpIcon,
  MicIcon,
  MicOffIcon,
  MoreHorizontalIcon,
  PenToolIcon,
  PhoneOffIcon,
  RadioIcon,
  UsersIcon,
  SendIcon,
  Trash2Icon,
  VideoIcon,
  VideoOffIcon,
  XIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import '@stream-io/video-react-sdk/dist/css/styles.css';
import Avatar from './Avatar';
import { saveTranscriptEntries } from '../lib/api';
import { removeActiveCall, saveCallLog, updateCallLog, upsertActiveCall } from '../lib/callHistory';

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;
const CALL_CHAT_EVENT = 'bizzcolab.call.chat';
const WHITEBOARD_STROKE_EVENT = 'bizzcolab.call.whiteboard.stroke';
const WHITEBOARD_CLEAR_EVENT = 'bizzcolab.call.whiteboard.clear';
const WHITEBOARD_VISIBILITY_EVENT = 'bizzcolab.call.whiteboard.visibility';
const WHITEBOARD_COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f97316', '#ef4444', '#111827'];
const WHITEBOARD_INITIAL_SIZE = { width: 3200, height: 2200 };
const WHITEBOARD_EXPAND_STEP = 800;
const WHITEBOARD_EDGE_PADDING = 180;
const TRANSCRIPT_EVENT = 'bizzcolab.call.transcript';

const createEventId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const cloneStrokes = (strokes = []) =>
  strokes.map((stroke) => ({
    ...stroke,
    points: (stroke.points || []).map((point) => ({ ...point })),
  }));

const mergeUniqueStrokes = (...strokeGroups) => {
  const seen = new Set();
  const merged = [];

  strokeGroups.flat().forEach((stroke) => {
    if (!stroke?.id || seen.has(stroke.id)) return;
    seen.add(stroke.id);
    merged.push(stroke);
  });

  return merged;
};

const pointsToSvgPath = (points = []) => {
  if (!points.length) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
};

const getOrgSlug = (user) => {
  if (!user?.organization) return null;
  if (typeof user.organization === 'object') return user.organization.slug || null;
  return null;
};

const InCallScreenShareButton = () => {
  const { useHasOngoingScreenShare, useScreenShareState } = useCallStateHooks();
  const isSomeoneScreenSharing = useHasOngoingScreenShare();
  const { screenShare, optionsAwareIsMute, isTogglePending } = useScreenShareState({
    optimisticUpdates: true,
  });

  const isSharingScreen = !optionsAwareIsMute;
  const isDisabled = isTogglePending || (!isSharingScreen && isSomeoneScreenSharing);
  const label = isSharingScreen ? 'Stop sharing' : isSomeoneScreenSharing ? 'Screen live' : 'Share screen';

  const handleToggle = async () => {
    if (isDisabled) return;

    try {
      await screenShare.toggle();
    } catch (error) {
      console.error('Screen share toggle error:', error);
      toast.error('Could not update screen sharing');
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isDisabled}
      title={isSomeoneScreenSharing && !isSharingScreen ? 'Another participant is already sharing' : label}
      className={`flex size-12 items-center justify-center rounded-full transition-all focus:outline-none
        ${isSharingScreen ? 'bg-violet-500 text-white hover:bg-violet-600' : 'bg-white/15 text-white hover:bg-white/25'}
        ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <MonitorUpIcon className="size-5" />
    </button>
  );
};

const InCallRecordingButton = ({ onStateChange }) => {
  const { useOwnCapabilities } = useCallStateHooks();
  const ownCapabilities = useOwnCapabilities() || [];
  const { toggleCallRecording, isAwaitingResponse, isCallRecordingInProgress } = useToggleCallRecording();

  const canStartRecording = ownCapabilities.includes(OwnCapability.START_RECORD_CALL);
  const canStopRecording = ownCapabilities.includes(OwnCapability.STOP_RECORD_CALL);
  const canRecord = canStartRecording || canStopRecording;

  useEffect(() => {
    onStateChange?.({
      inProgress: isCallRecordingInProgress,
      pending: isAwaitingResponse,
      canRecord,
    });
  }, [canRecord, isAwaitingResponse, isCallRecordingInProgress, onStateChange]);

  const handleToggle = async () => {
    if (!canRecord || isAwaitingResponse) return;

    try {
      await toggleCallRecording();
    } catch (error) {
      console.error('Recording error:', error);
      toast.error(`Recording failed: ${error.message || 'Unknown error'}`);
    }
  };

  if (!canRecord) {
    return (
      <button
        disabled
        title="Recording unavailable for your role"
        className="flex size-12 items-center justify-center rounded-full bg-white/15 text-white/30 cursor-not-allowed opacity-40"
      >
        <RadioIcon className="size-5" />
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isAwaitingResponse}
      title={isCallRecordingInProgress ? 'Stop recording' : 'Record call'}
      className={`flex size-12 items-center justify-center rounded-full transition-all focus:outline-none
        ${isCallRecordingInProgress ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-white/15 text-white hover:bg-white/25'}
        ${isAwaitingResponse ? 'opacity-50 cursor-wait' : ''}`}
    >
      <RadioIcon className={`size-5 ${isCallRecordingInProgress ? 'animate-pulse' : ''}`} />
    </button>
  );
};

const InCallInviteBackButton = ({ members = [], onInvite }) => {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();

  const missingMembers = useMemo(() => {
    const joinedIds = new Set(
      (participants || [])
        .map((participant) => participant?.userId || participant?.sessionId)
        .filter(Boolean)
    );

    return members.filter((member) => member?.id && !member.isYou && !joinedIds.has(member.id));
  }, [members, participants]);

  const label = missingMembers.length > 0
    ? missingMembers.length === 1
      ? `Invite ${missingMembers[0].name.split(' ')[0] || 'back'}`
      : `Invite ${missingMembers.length} back`
    : 'Everyone is here';

  return (
    <button
      onClick={() => onInvite?.(missingMembers)}
      disabled={missingMembers.length === 0}
      title={missingMembers.length > 0 ? label : 'All invited members are in the call'}
      className={`flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all focus:outline-none
        ${missingMembers.length > 0
          ? 'bg-white/15 text-white hover:bg-white/25'
          : 'bg-white/5 text-white/30 cursor-not-allowed'}`}
    >
      <UsersIcon className="size-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
};

const VideoCallModal = ({
  isOpen,
  onClose,
  callId,
  apiKey,
  token,
  user,
  isInitiator,
  participantIds = [],
  participantNames = [],
  participantProfiles = [],
  callType = 'video',
  conversationId = '',
  isChannel = false,
  callerUserId = '',
  conversationName = '',
}) => {
  const [client, setClient] = useState(null);
  const [call, setCall] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPending, setIsRecordingPending] = useState(false);
  const [canRecord, setCanRecord] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCamEnabled, setIsCamEnabled] = useState(callType === 'video');
  const [isInCallMicEnabled, setIsInCallMicEnabled] = useState(true);
  const [isInCallCamEnabled, setIsInCallCamEnabled] = useState(callType === 'video');
  const [previewStream, setPreviewStream] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [speakerDevices, setSpeakerDevices] = useState([]);
  const [selectedMicId, setSelectedMicId] = useState('');
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState('chat');
  const [activeStageTab, setActiveStageTab] = useState('meeting');
  const [isWhiteboardShared, setIsWhiteboardShared] = useState(false);
  const [sharedWhiteboardOwnerId, setSharedWhiteboardOwnerId] = useState('');
  const [sharedWhiteboardOwnerName, setSharedWhiteboardOwnerName] = useState('');
  const [isSharedWhiteboardCollaborative, setIsSharedWhiteboardCollaborative] = useState(false);
  const [showWhiteboardPopup, setShowWhiteboardPopup] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [whiteboardStrokes, setWhiteboardStrokes] = useState([]);
  const [draftStroke, setDraftStroke] = useState(null);
  const [personalWhiteboardStrokes, setPersonalWhiteboardStrokes] = useState([]);
  const [personalDraftStroke, setPersonalDraftStroke] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState(WHITEBOARD_COLORS[0]);
  const [brushWidth, setBrushWidth] = useState(3);
  const [boardSize, setBoardSize] = useState(WHITEBOARD_INITIAL_SIZE);
  const [personalBoardSize, setPersonalBoardSize] = useState(WHITEBOARD_INITIAL_SIZE);
  const callRef = useRef(null);
  const previewVideoRef = useRef(null);
  const whiteboardRef = useRef(null);
  const whiteboardScrollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const customUnsubscribeRef = useRef(null);
  const draftStrokeRef = useRef(null);
  const personalDraftStrokeRef = useRef(null);
  const hasJoinedCallRef = useRef(false);

  const [transcriptEntries, setTranscriptEntries] = useState([]);
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recognitionRef = useRef(null);
  const isTranscribingRef = useRef(false);
  const shouldCaptureSpeechRef = useRef(false);
  const pendingEntriesRef = useRef([]);
  const transcriptEndRef = useRef(null);
  const streamApiKey = apiKey || STREAM_API_KEY;

  const updateDraftStroke = (updater) => {
    setDraftStroke((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      draftStrokeRef.current = next;
      return next;
    });
  };

  const updatePersonalDraftStroke = (updater) => {
    setPersonalDraftStroke((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      personalDraftStrokeRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    const shouldEnableCamera = callType === 'video';
    setIsCamEnabled(shouldEnableCamera);
    setIsInCallCamEnabled(shouldEnableCamera);
  }, [callType, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setChatMessages([]);
      setChatInput('');
      setWhiteboardStrokes([]);
      setDraftStroke(null);
      setPersonalWhiteboardStrokes([]);
      setPersonalDraftStroke(null);
      draftStrokeRef.current = null;
      personalDraftStrokeRef.current = null;
      setIsSidebarOpen(true);
      setActiveSidebarTab('chat');
      setActiveStageTab('meeting');
      setIsWhiteboardShared(false);
      setSharedWhiteboardOwnerId('');
      setSharedWhiteboardOwnerName('');
      setIsSharedWhiteboardCollaborative(false);
      setShowWhiteboardPopup(false);
      setBrushColor(WHITEBOARD_COLORS[0]);
      setBrushWidth(3);
      setBoardSize(WHITEBOARD_INITIAL_SIZE);
      setPersonalBoardSize(WHITEBOARD_INITIAL_SIZE);
      setTranscriptEntries([]);
      setTranscriptDraft('');
      setIsTranscribing(false);
      isTranscribingRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      pendingEntriesRef.current = [];
    }
  }, [isOpen]);

  const isPersonalWhiteboardOpen = showWhiteboardPopup && !isWhiteboardShared;
  const activeBoardSize = isPersonalWhiteboardOpen ? personalBoardSize : boardSize;

  useEffect(() => {
    if (!showWhiteboardPopup) return;
    requestAnimationFrame(() => {
      const el = whiteboardScrollRef.current;
      if (!el) return;
      el.scrollLeft = Math.max(0, (activeBoardSize.width - el.clientWidth) / 2);
      el.scrollTop = Math.max(0, (activeBoardSize.height - el.clientHeight) / 2);
    });
  }, [showWhiteboardPopup, activeBoardSize.height, activeBoardSize.width]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const setupPreview = async () => {
      try {
        setPreviewError('');
        if (previewStream) {
          previewStream.getTracks().forEach((track) => track.stop());
        }

        const needsVideo = callType === 'video';

        const media = await navigator.mediaDevices.getUserMedia({
          audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
          video: needsVideo
            ? (selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true)
            : false,
        });

        const devices = await navigator.mediaDevices.enumerateDevices();

        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }

        const microphones = devices.filter((device) => device.kind === 'audioinput');
        const cameras = devices.filter((device) => device.kind === 'videoinput');
        const speakers = devices.filter((device) => device.kind === 'audiooutput');
        setAudioDevices(microphones);
        setVideoDevices(cameras);
        setSpeakerDevices(speakers);
        if (!selectedMicId && microphones[0]?.deviceId) {
          setSelectedMicId(microphones[0].deviceId);
        }
        if (!selectedCameraId && cameras[0]?.deviceId) {
          setSelectedCameraId(cameras[0].deviceId);
        }
        if (!selectedSpeakerId && speakers[0]?.deviceId) {
          setSelectedSpeakerId(speakers[0].deviceId);
        }

        media.getAudioTracks().forEach((track) => {
          track.enabled = isMicEnabled;
        });
        media.getVideoTracks().forEach((track) => {
          track.enabled = needsVideo && isCamEnabled;
        });
        setPreviewStream(media);
      } catch (error) {
        console.error('Preview setup error:', error);
        setPreviewError('Camera or microphone access is blocked. You can still join after allowing permissions.');
      }
    };

    setupPreview();

    return () => {
      cancelled = true;
    };
  }, [isOpen, callType, selectedMicId, selectedCameraId, selectedSpeakerId]);

  useEffect(() => {
    if (!previewStream) return;
    previewStream.getAudioTracks().forEach((track) => {
      track.enabled = isMicEnabled;
    });
    previewStream.getVideoTracks().forEach((track) => {
      track.enabled = callType === 'video' && isCamEnabled;
    });
  }, [previewStream, isMicEnabled, isCamEnabled, callType]);

  useEffect(() => {
    if (previewVideoRef.current && previewStream) {
      previewVideoRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  useEffect(() => {
    const activeCall = callRef.current || call;
    if (!activeCall || !selectedSpeakerId || !activeCall.speaker?.select) return;

    activeCall.speaker.select(selectedSpeakerId)?.catch((error) => {
      console.error('Speaker selection error:', error);
    });
  }, [call, selectedSpeakerId]);

  useEffect(() => {
    if (!isOpen || !token || !user) return;

    return () => {
      const currentCall = callRef.current;
      customUnsubscribeRef.current?.();
      customUnsubscribeRef.current = null;
      if (currentCall) {
        if (hasJoinedCallRef.current) {
          const participants = currentCall.state?.participants || [];
          // If we are the only participant (or there are 0 somehow), end the call entirely
          if (participants.length <= 1) {
            updateCallLog(callId, {
              status: 'ended',
              endTime: new Date().toISOString(),
            });
            removeActiveCall(callId);
            currentCall.endCall().catch(() => {});
          } else {
            updateCallLog(callId, {
              status: 'left',
              lastLeftAt: new Date().toISOString(),
            });
            upsertActiveCall({
              callId,
              conversationId,
              type: callType,
              participantIds: Array.from(new Set(participantIds)).filter(Boolean),
              participantNames: Array.from(new Set(participantNames)).filter(Boolean),
              participantProfiles,
              status: 'ongoing',
            });
            currentCall.leave().catch(() => {});
          }
        } else {
          currentCall.leave().catch(() => {});
        }
      }
      callRef.current = null;
      hasJoinedCallRef.current = false;
      // Stop transcription and flush pending entries
      isTranscribingRef.current = false;
      try { recognitionRef.current?.stop(); } catch (_) {}
      recognitionRef.current = null;
      const pendingEntries = [...pendingEntriesRef.current];
      pendingEntriesRef.current = [];
      if (pendingEntries.length > 0) {
        saveTranscriptEntries(callId, pendingEntries).catch(() => {});
      }
      setCall(null);
      setClient(null);
      setIsRecording(false);
      setIsRecordingPending(false);
      setCanRecord(false);
      setIsJoining(false);
      setIsInCallMicEnabled(true);
      setIsInCallCamEnabled(callType === 'video');
      setSpeakerDevices([]);
      setSelectedSpeakerId('');
      setPreviewStream((current) => {
        current?.getTracks().forEach((track) => track.stop());
        return null;
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, callType, conversationId, isOpen, participantIds, participantNames, participantProfiles, token, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptEntries]);

  const sendCustomCallEvent = async (payload) => {
    const activeCall = callRef.current || call;
    if (!activeCall) return;
    await activeCall.sendCustomEvent(payload);
  };

  const appendChatMessage = (message) => {
    if (!message?.id) return;
    setChatMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message]));
  };

  const appendWhiteboardStroke = (stroke) => {
    if (!stroke?.id || !stroke?.points?.length) return;
    ensureBoardSizeForPoints(stroke.points, 'shared');
    setWhiteboardStrokes((prev) => (prev.some((item) => item.id === stroke.id) ? prev : [...prev, stroke]));
  };

  const appendPersonalWhiteboardStroke = (stroke) => {
    if (!stroke?.id || !stroke?.points?.length) return;
    ensureBoardSizeForPoints(stroke.points, 'personal');
    setPersonalWhiteboardStrokes((prev) => (prev.some((item) => item.id === stroke.id) ? prev : [...prev, stroke]));
  };

  const appendTranscriptEntry = (entry) => {
    if (!entry?.id) return;
    setTranscriptEntries((prev) => (prev.some((e) => e.id === entry.id) ? prev : [...prev, entry]));
  };

  const startTranscription = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || recognitionRef.current || !shouldCaptureSpeechRef.current) return;

    isTranscribingRef.current = true;
    setIsTranscribing(true);

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      if (!shouldCaptureSpeechRef.current) {
        setTranscriptDraft('');
        return;
      }

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (!text) continue;
          const entry = {
            id: createEventId(),
            speakerId: user._id,
            speakerName: user.fullName,
            text,
            timestamp: new Date().toISOString(),
          };
          appendTranscriptEntry(entry);
          pendingEntriesRef.current.push(entry);
          sendCustomCallEvent({ type: TRANSCRIPT_EVENT, entry }).catch(() => {});
          setTranscriptDraft('');
        } else {
          setTranscriptDraft(result[0].transcript);
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('Speech recognition error:', event.error);
      }
    };

    recognition.onend = () => {
      if (isTranscribingRef.current && shouldCaptureSpeechRef.current) {
        try { recognition.start(); } catch (_) {}
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      isTranscribingRef.current = false;
      setIsTranscribing(false);
    }
  };

  const stopTranscription = () => {
    isTranscribingRef.current = false;
    setIsTranscribing(false);
    setTranscriptDraft('');
    try { recognitionRef.current?.stop(); } catch (_) {}
    recognitionRef.current = null;
  };

  const flushTranscriptToBackend = () => {
    const entries = [...pendingEntriesRef.current];
    pendingEntriesRef.current = [];
    if (entries.length > 0) {
      saveTranscriptEntries(callId, entries).catch(() => {});
    }
  };

  useEffect(() => {
    const shouldTranscribe = Boolean(callRef.current || call) && hasJoinedCallRef.current && isInCallMicEnabled;
    shouldCaptureSpeechRef.current = shouldTranscribe;

    if (!hasJoinedCallRef.current) return;

    if (shouldTranscribe) {
      startTranscription();
      return;
    }

    if (recognitionRef.current || isTranscribingRef.current) {
      stopTranscription();
      flushTranscriptToBackend();
    }
  }, [call, isInCallMicEnabled]);

  const downloadTranscript = () => {
    if (!transcriptEntries.length) return;
    const lines = transcriptEntries.map((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const speaker = entry.speakerId === user._id ? 'You' : entry.speakerName;
      return `[${time}] ${speaker}: ${entry.text}`;
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transcript-${callId}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const ensureBoardSizeForPoints = (points = [], scope = 'shared') => {
    if (!points.length) return;

    const maxX = Math.max(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));

    const updateSize = (prev) => ({
      width: maxX > prev.width - WHITEBOARD_EDGE_PADDING ? prev.width + WHITEBOARD_EXPAND_STEP : prev.width,
      height: maxY > prev.height - WHITEBOARD_EDGE_PADDING ? prev.height + WHITEBOARD_EXPAND_STEP : prev.height,
    });

    if (scope === 'personal') {
      setPersonalBoardSize(updateSize);
      return;
    }

    setBoardSize(updateSize);
  };

  const registerCustomEventHandlers = (activeCall) => {
    customUnsubscribeRef.current?.();
    customUnsubscribeRef.current = activeCall.on('custom', (event) => {
      const custom = event.custom;
      if (!custom?.type) return;

      if (custom.type === CALL_CHAT_EVENT) {
        const message = custom.message;
        if (!message || message.userId === user?._id) return;
        appendChatMessage(message);
      }

      if (custom.type === WHITEBOARD_STROKE_EVENT) {
        const stroke = custom.stroke;
        if (!stroke || stroke.userId === user?._id) return;
        appendWhiteboardStroke(stroke);
        if (custom.ownerId && custom.ownerId === user?._id) {
          appendPersonalWhiteboardStroke(stroke);
        }
      }

      if (custom.type === WHITEBOARD_CLEAR_EVENT && custom.userId !== user?._id) {
        setWhiteboardStrokes([]);
        setDraftStroke(null);
        draftStrokeRef.current = null;
        setBoardSize(WHITEBOARD_INITIAL_SIZE);
        if (custom.ownerId && custom.ownerId === user?._id) {
          setPersonalWhiteboardStrokes([]);
          setPersonalDraftStroke(null);
          personalDraftStrokeRef.current = null;
          setPersonalBoardSize(WHITEBOARD_INITIAL_SIZE);
        }
      }

      if (custom.type === WHITEBOARD_VISIBILITY_EVENT) {
        const shouldShowWhiteboard = Boolean(custom.shared);
        setIsWhiteboardShared(shouldShowWhiteboard);
        setSharedWhiteboardOwnerId(custom.ownerId || '');
        setSharedWhiteboardOwnerName(custom.ownerName || '');
        setIsSharedWhiteboardCollaborative(Boolean(custom.collaborative));

        if (shouldShowWhiteboard && Array.isArray(custom.strokes)) {
          const snapshot = cloneStrokes(custom.strokes);
          const nextSize = custom.boardSize || WHITEBOARD_INITIAL_SIZE;
          setWhiteboardStrokes(snapshot);
          setBoardSize(nextSize);

          if (custom.ownerId === user?._id) {
            setPersonalWhiteboardStrokes(snapshot);
            setPersonalBoardSize(nextSize);
          }
        }

        if (shouldShowWhiteboard) {
          setActiveStageTab('whiteboard');
        } else {
          setActiveStageTab((current) => (current === 'whiteboard' ? 'meeting' : current));
        }
      }

      if (custom.type === TRANSCRIPT_EVENT) {
        const entry = custom.entry;
        if (!entry?.id || entry.speakerId === user?._id) return;
        appendTranscriptEntry(entry);
      }
    });
  };

  const joinCall = async () => {
    if (isJoining || call) return;
    if (!token || !user || !streamApiKey) {
      toast.error('Call credentials are missing.');
      return;
    }

    const initialize = async () => {
      const videoClient = StreamVideoClient.getOrCreateInstance({
        apiKey: streamApiKey,
        user: {
          id: user._id,
          name: user.fullName,
          image: user.profilePic?.startsWith('data:') ? '' : user.profilePic || '',
        },
        token,
      });

      setClient(videoClient);
      const videoCall = videoClient.call('default', callId);
      callRef.current = videoCall;
      const uniqueParticipantIds = Array.from(new Set([user._id, ...participantIds])).filter(Boolean);
      const team = getOrgSlug(user);

      if (isInitiator) {
        // Create the call and ring all members.
        // The `data.members` array includes both the caller and all callees.
        await videoCall.getOrCreate({
          ring: true,
          video: callType === 'video',
          data: {
            members: uniqueParticipantIds.map((id) => ({ user_id: id })),
            ...(team ? { team } : {}),
            custom: { conversationId, isChannel: Boolean(isChannel), conversationName: conversationName || '', callType: callType || 'video' },
          },
        });
      } else {
        // Callee: fetch the call state before joining so the SDK knows
        // the call is in `ringing` state and can accept it properly.
        await videoCall.get();
      }

      if (callType !== 'video') {
        await videoCall.camera.disable().catch(() => {});
      }

      // join() internally accepts the ring for the callee.
      await videoCall.join({ create: false });

      if (selectedMicId) {
        await videoCall.microphone.select(selectedMicId);
      }
      if (callType === 'video' && selectedCameraId) {
        await videoCall.camera.select(selectedCameraId);
      }
      if (selectedSpeakerId && videoCall.speaker?.select) {
        await videoCall.speaker.select(selectedSpeakerId);
      }

      if (!isMicEnabled) await videoCall.microphone.disable();
      if (callType !== 'video') {
        await videoCall.camera.disable().catch(() => {});
      } else if (!isCamEnabled) {
        await videoCall.camera.disable();
      }

      registerCustomEventHandlers(videoCall);
      setCall(videoCall);
      setIsInCallMicEnabled(isMicEnabled);
      setIsInCallCamEnabled(callType === 'video' ? isCamEnabled : false);
      setPreviewStream((current) => {
        current?.getTracks().forEach((track) => track.stop());
        return null;
      });

      const callLog = {
        callId,
        conversationId,
        isChannel: Boolean(isChannel),
        conversationName: conversationName || undefined,
        hostId: isInitiator ? user._id : (callerUserId || undefined),
        type: callType,
        startTime: new Date().toISOString(),
        participants: Array.from(new Set(participantNames)).filter(Boolean),
        participantIds: Array.from(new Set(participantIds)).filter((id) => id && id !== user._id),
        participantProfiles: meetingRoster,
        status: 'started',
      };

      saveCallLog(callLog);
      upsertActiveCall({
        ...callLog,
        status: 'ongoing',
        startedAt: callLog.startTime,
        joinedAt: new Date().toISOString(),
      });
      hasJoinedCallRef.current = true;
      shouldCaptureSpeechRef.current = Boolean(isMicEnabled);

      toast.success('Connected to call');
    };

    try {
      setIsJoining(true);
      await initialize();
    } catch (error) {
      console.error('Error initializing call:', error);
      toast.error('Failed to connect to call');
      onClose?.();
    } finally {
      setIsJoining(false);
    }
  };

  const handleRecordingStateChange = useCallback((state) => {
    setIsRecording(Boolean(state?.inProgress));
    setIsRecordingPending(Boolean(state?.pending));
    setCanRecord(Boolean(state?.canRecord));
  }, []);

  useEffect(() => {
    const logs = JSON.parse(localStorage.getItem('callLogs') || '[]');
    const index = logs.findIndex((log) => log.callId === callId);
    if (index === -1) return;

    const current = logs[index];
    const next = { ...current };

    if (canRecord !== undefined) {
      next.canRecord = canRecord;
    }

    if (isRecording) {
      next.recorded = true;
      next.recordingStartedAt = next.recordingStartedAt || new Date().toISOString();
      delete next.recordingEndedAt;
    } else if (current.recordingStartedAt && !current.recordingEndedAt) {
      next.recordingEndedAt = new Date().toISOString();
    }

    updateCallLog(callId, next);
  }, [callId, canRecord, isRecording]);

  const handleInviteMembersAgain = async (membersToInvite = []) => {
    const activeCall = callRef.current || call;
    const invitees = membersToInvite.filter((member) => {
      if (!member?.id || member.isYou) return false;
      return participantIds.includes(member.id) || participantProfiles.some((profile) => profile?.id === member.id);
    });

    if (!activeCall || invitees.length === 0) return;

    try {
      await activeCall.updateCallMembers({
        update_members: invitees.map((member) => ({ user_id: member.id })),
      });

      let usedNotificationFallback = false;
      try {
        await activeCall.ring();
      } catch (ringError) {
        console.error('Ring members again failed, trying notification fallback:', ringError);
        usedNotificationFallback = true;
      }

      try {
        await activeCall.notify();
        usedNotificationFallback = true;
      } catch (notifyError) {
        if (!usedNotificationFallback) {
          throw notifyError;
        }
        console.error('Notification fallback after re-invite failed:', notifyError);
      }

      updateCallLog(callId, {
        lastRangAt: new Date().toISOString(),
        ringAgainCount: ((JSON.parse(localStorage.getItem('callLogs') || '[]').find((entry) => entry.callId === callId)?.ringAgainCount) || 0) + 1,
      });
      upsertActiveCall({
        callId,
        conversationId,
        isChannel: Boolean(isChannel),
        type: callType,
        participantIds: Array.from(new Set(participantIds)).filter(Boolean),
        participantNames: Array.from(new Set(participantNames)).filter(Boolean),
        participantProfiles: meetingRoster,
        status: 'ongoing',
      });

      toast.success(
        invitees.length === 1
          ? usedNotificationFallback
            ? `Rang and notified ${invitees[0].name} again`
            : `Ringing ${invitees[0].name} again`
          : usedNotificationFallback
          ? `Rang and notified ${invitees.length} members again`
          : `Ringing ${invitees.length} members again`
      );
    } catch (error) {
      console.error('Invite back error:', error);
      toast.error(error?.message || 'Could not ring members again');
    }
  };

  const toggleInCallMicrophone = async () => {
    const activeCall = callRef.current || call;
    if (!activeCall) return;

    try {
      if (isInCallMicEnabled) {
        shouldCaptureSpeechRef.current = false;
        stopTranscription();
        flushTranscriptToBackend();
        await activeCall.microphone.disable();
        setIsInCallMicEnabled(false);
      } else {
        await activeCall.microphone.enable();
        if (selectedMicId) await activeCall.microphone.select(selectedMicId);
        setIsInCallMicEnabled(true);
        shouldCaptureSpeechRef.current = true;
      }
    } catch (error) {
      console.error('Microphone toggle error:', error);
      toast.error('Could not update microphone state');
    }
  };

  const toggleInCallCamera = async () => {
    const activeCall = callRef.current || call;
    if (!activeCall || callType !== 'video') return;

    try {
      if (isInCallCamEnabled) {
        await activeCall.camera.disable();
        setIsInCallCamEnabled(false);
      } else {
        await activeCall.camera.enable();
        if (selectedCameraId) await activeCall.camera.select(selectedCameraId);
        setIsInCallCamEnabled(true);
      }
    } catch (error) {
      console.error('Camera toggle error:', error);
      toast.error('Could not update camera state');
    }
  };

  const leaveCurrentCall = async () => {
    const activeCall = callRef.current || call;
    try {
      const participants = activeCall?.state?.participants || [];
      // If we are the only participant left in the call (or 0 somehow)
      if (participants.length <= 1) {
        updateCallLog(callId, {
          status: 'ended',
          endTime: new Date().toISOString(),
        });
        removeActiveCall(callId);
        await activeCall?.endCall();
      } else {
        updateCallLog(callId, {
          status: 'left',
          lastLeftAt: new Date().toISOString(),
        });
        upsertActiveCall({
          callId,
          conversationId,
          isChannel: Boolean(isChannel),
          type: callType,
          participantIds: Array.from(new Set(participantIds)).filter(Boolean),
          participantNames: Array.from(new Set(participantNames)).filter(Boolean),
          participantProfiles: meetingRoster.filter((member) => !member.isYou),
          status: 'ongoing',
        });
        await activeCall?.leave();
      }
    } catch (_) {
      // noop
    }
    stopTranscription();
    flushTranscriptToBackend();
    hasJoinedCallRef.current = false;
    onClose?.();
  };

  const handleSendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text) return;

    const message = {
      id: createEventId(),
      text,
      userId: user._id,
      userName: user.fullName,
      createdAt: new Date().toISOString(),
    };

    appendChatMessage(message);
    setChatInput('');

    try {
      await sendCustomCallEvent({ type: CALL_CHAT_EVENT, message });
    } catch (error) {
      console.error('In-call chat send error:', error);
      toast.error('Failed to send in-call message');
    }
  };

  const getBoardPoint = (event) => {
    const surface = whiteboardRef.current;
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height),
    };
  };

  const startDrawing = (event) => {
    if (!isPersonalWhiteboardOpen && isWhiteboardShared && !canEditSharedWhiteboard) {
      toast.error('This shared whiteboard is view only.');
      return;
    }

    const point = getBoardPoint(event);
    if (!point) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDrawing(true);
    const nextStroke = {
      id: createEventId(),
      userId: user._id,
      userName: user.fullName,
      color: brushColor,
      width: brushWidth,
      points: [point],
    };

    if (isPersonalWhiteboardOpen) {
      updatePersonalDraftStroke(nextStroke);
      return;
    }

    updateDraftStroke(nextStroke);
  };

  const continueDrawing = (event) => {
    if (!isDrawing) return;
    const point = getBoardPoint(event);
    if (!point) return;

    ensureBoardSizeForPoints([point], isPersonalWhiteboardOpen ? 'personal' : 'shared');

    const updater = (prev) => {
      if (!prev) return prev;
      const last = prev.points[prev.points.length - 1];
      if (last && Math.abs(last.x - point.x) < 0.0025 && Math.abs(last.y - point.y) < 0.0025) {
        return prev;
      }
      return {
        ...prev,
        points: [...prev.points, point],
      };
    };

    if (isPersonalWhiteboardOpen) {
      updatePersonalDraftStroke(updater);
      return;
    }

    updateDraftStroke(updater);
  };

  const stopDrawing = async () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const stroke = isPersonalWhiteboardOpen ? personalDraftStrokeRef.current : draftStrokeRef.current;

    if (!stroke?.points?.length) {
      if (isPersonalWhiteboardOpen) {
        updatePersonalDraftStroke(null);
      } else {
        updateDraftStroke(null);
      }
      return;
    }

    if (isPersonalWhiteboardOpen) {
      appendPersonalWhiteboardStroke(stroke);
      updatePersonalDraftStroke(null);
      return;
    }

    appendWhiteboardStroke(stroke);
    if (isSharedBoardOwner) {
      appendPersonalWhiteboardStroke(stroke);
    }

    try {
      await sendCustomCallEvent({
        type: WHITEBOARD_STROKE_EVENT,
        stroke,
        ownerId: sharedWhiteboardOwnerId || user._id,
      });
    } catch (error) {
      console.error('Whiteboard sync error:', error);
      toast.error('Failed to sync whiteboard stroke');
    }

    updateDraftStroke(null);
  };

  const clearWhiteboard = async () => {
    if (isPersonalWhiteboardOpen) {
      setPersonalWhiteboardStrokes([]);
      updatePersonalDraftStroke(null);
      setPersonalBoardSize(WHITEBOARD_INITIAL_SIZE);
      return;
    }

    setWhiteboardStrokes([]);
    updateDraftStroke(null);
    setBoardSize(WHITEBOARD_INITIAL_SIZE);
    if (sharedWhiteboardOwnerId === user?._id) {
      setPersonalWhiteboardStrokes([]);
      updatePersonalDraftStroke(null);
      setPersonalBoardSize(WHITEBOARD_INITIAL_SIZE);
    }
    try {
      await sendCustomCallEvent({
        type: WHITEBOARD_CLEAR_EVENT,
        userId: user._id,
        ownerId: sharedWhiteboardOwnerId || user._id,
      });
    } catch (error) {
      console.error('Whiteboard clear sync error:', error);
      toast.error('Failed to sync whiteboard clear');
    }
  };

  const broadcastWhiteboardShareState = async ({ shared, collaborative, strokes, size }) => {
    await sendCustomCallEvent({
      type: WHITEBOARD_VISIBILITY_EVENT,
      shared,
      ownerId: shared ? user._id : '',
      ownerName: shared ? user.fullName : '',
      collaborative: shared ? collaborative : false,
      strokes: shared ? cloneStrokes(strokes) : [],
      boardSize: shared ? size : WHITEBOARD_INITIAL_SIZE,
      userId: user._id,
    });
  };

  const shareWhiteboard = async () => {
    const snapshot = cloneStrokes(personalWhiteboardStrokes);
    const snapshotSize = personalBoardSize;
    setIsWhiteboardShared(true);
    setSharedWhiteboardOwnerId(user._id);
    setSharedWhiteboardOwnerName(user.fullName);
    setActiveStageTab('whiteboard');
    setWhiteboardStrokes(snapshot);
    setBoardSize(snapshotSize);

    try {
      await broadcastWhiteboardShareState({
        shared: true,
        collaborative: isSharedWhiteboardCollaborative,
        strokes: snapshot,
        size: snapshotSize,
      });
      toast.success('Whiteboard shared with the meeting');
    } catch (error) {
      console.error('Whiteboard share sync error:', error);
      toast.error('Failed to share whiteboard');
    }
  };

  const stopWhiteboardShare = async () => {
    setIsWhiteboardShared(false);
    setSharedWhiteboardOwnerId('');
    setSharedWhiteboardOwnerName('');
    setIsSharedWhiteboardCollaborative(false);
    setActiveStageTab((current) => (current === 'whiteboard' ? 'meeting' : current));

    try {
      await broadcastWhiteboardShareState({
        shared: false,
        collaborative: false,
        strokes: [],
        size: WHITEBOARD_INITIAL_SIZE,
      });
      toast.success('Whiteboard hidden from the meeting');
    } catch (error) {
      console.error('Whiteboard hide sync error:', error);
      toast.error('Failed to update whiteboard sharing');
    }
  };

  const toggleSharedWhiteboardCollaboration = async () => {
    const nextCollaborative = !isSharedWhiteboardCollaborative;
    setIsSharedWhiteboardCollaborative(nextCollaborative);

    try {
      await broadcastWhiteboardShareState({
        shared: true,
        collaborative: nextCollaborative,
        strokes: whiteboardStrokes,
        size: boardSize,
      });
      toast.success(nextCollaborative ? 'Participants can now draw on your whiteboard' : 'Your whiteboard is now view only for others');
    } catch (error) {
      console.error('Whiteboard collaboration sync error:', error);
      setIsSharedWhiteboardCollaborative((current) => !current);
      toast.error('Failed to update whiteboard permissions');
    }
  };

  const renderedStrokes = useMemo(
    () => mergeUniqueStrokes(whiteboardStrokes, draftStroke ? [draftStroke] : []),
    [draftStroke, whiteboardStrokes]
  );
  const personalRenderedStrokes = useMemo(
    () => mergeUniqueStrokes(personalWhiteboardStrokes, personalDraftStroke ? [personalDraftStroke] : []),
    [personalDraftStroke, personalWhiteboardStrokes]
  );
  const isSharedBoardOwner = isWhiteboardShared && sharedWhiteboardOwnerId === user?._id;
  const canEditSharedWhiteboard = isSharedBoardOwner || isSharedWhiteboardCollaborative;

  const popupBoardTitle = isWhiteboardShared
    ? `${isSharedBoardOwner ? 'Your' : `${sharedWhiteboardOwnerName || 'Participant'}'s`} shared whiteboard`
    : 'Personal whiteboard';
  const popupBoardDescription = isWhiteboardShared
    ? `Draw, scroll, and expand ${isSharedBoardOwner ? 'your' : `${sharedWhiteboardOwnerName || 'the participant'}'s`} board as the discussion grows.`
    : 'Sketch privately, capture ideas, and keep notes without sharing them to the meeting.';
  const activeRenderedStrokes = isPersonalWhiteboardOpen ? personalRenderedStrokes : renderedStrokes;

  const workspaceLabel = user?.organization?.name || 'Organization Platform';
  const sessionLabel = participantNames.length ? participantNames.join(', ') : 'Call Session';
  const meetingRoster = useMemo(() => {
    const profileMap = new Map();

    participantProfiles.forEach((profile, index) => {
      const profileId = profile?.id || participantIds[index] || profile?.name;
      if (!profileId) return;
      profileMap.set(profileId, {
        id: profileId,
        name: profile?.name || participantNames[index] || profileId,
        image: profile?.image || '',
      });
    });

    if (user?._id) {
      profileMap.set(user._id, {
        id: user._id,
        name: user.fullName,
        image: user.profilePic || '',
      });
    }

    participantIds.forEach((id, index) => {
      if (!id || profileMap.has(id)) return;
      profileMap.set(id, {
        id,
        name: participantNames[index] || id,
        image: '',
      });
    });

    participantNames.forEach((name, index) => {
      const fallbackId = participantIds[index] || `${name}-${index}`;
      if (!name || profileMap.has(fallbackId)) return;
      profileMap.set(fallbackId, {
        id: fallbackId,
        name,
        image: '',
      });
    });

    return Array.from(profileMap.values()).map((member) => ({
      ...member,
      isYou: member.id === user?._id || member.name === user?.fullName,
    }));
  }, [participantIds, participantNames, participantProfiles, user?._id, user?.fullName, user?.profilePic]);

  const participantImageLookup = useMemo(() => {
    const lookup = new Map();

    meetingRoster.forEach((member) => {
      if (!member) return;
      if (member.id) lookup.set(member.id, member.image || '');
      if (member.name) lookup.set(member.name, member.image || '');
    });

    if (user?._id) lookup.set(user._id, user.profilePic || '');
    if (user?.fullName) lookup.set(user.fullName, user.profilePic || '');

    return lookup;
  }, [meetingRoster, user?._id, user?.fullName, user?.profilePic]);

  const CallVideoPlaceholder = useMemo(
    () =>
      forwardRef(function CallVideoPlaceholder({ participant, style, className = '', ...rest }, ref) {
        const displayName = participant?.name || participant?.userId || 'Participant';
        const displayImage = participantImageLookup.get(participant?.userId) || participantImageLookup.get(displayName) || participant?.image || '';

        return (
          <div
            ref={ref}
            style={style}
            className={`flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_42%),linear-gradient(180deg,#0f172a_0%,#111827_100%)] p-6 ${className}`}
            {...rest}
          >
            <div className="flex flex-col items-center text-center text-white">
              <Avatar
                src={displayImage}
                name={displayName}
                size="w-24 h-24 sm:w-28 sm:h-28"
                className="ring-4 ring-white/10 shadow-2xl"
              />
              <p className="mt-4 text-base font-semibold sm:text-lg">{displayName}</p>
              <p className="mt-1 text-xs text-white/65 sm:text-sm">Camera is off</p>
            </div>
          </div>
        );
      }),
    [participantImageLookup]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d0f13]">
      {/* ── Active call ── */}
      {client && call ? (
        <StreamVideo client={client}>
          <StreamCall call={call}>
            <div className="relative flex h-full w-full overflow-hidden">

              {/* ── Top bar ── */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between px-5 py-3"
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%)' }}
              >
                <div className="pointer-events-auto flex items-center gap-3">
                  <span className="inline-flex size-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm font-semibold text-white/90 truncate max-w-[220px]">{workspaceLabel}</span>
                  <span className="text-white/25 text-xs">·</span>
                  <span className="text-sm text-white/55 truncate max-w-[200px]">{sessionLabel}</span>
                  {isRecording && (
                    <span className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 text-[11px] font-semibold text-red-400 border border-red-500/30">
                      <span className="inline-flex size-1.5 rounded-full bg-red-400 animate-pulse" />
                      REC
                    </span>
                  )}
                </div>
                <div className="pointer-events-auto flex items-center gap-2">
                  {isWhiteboardShared && (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/70 border border-white/10">
                      <PenToolIcon className="inline size-3 mr-1 -mt-0.5" />
                      {isSharedBoardOwner ? 'Your whiteboard is shared' : `${sharedWhiteboardOwnerName || 'Participant'}'s whiteboard`}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Main stage + sidebar ── */}
              <div className={`flex min-h-0 flex-1 ${isSidebarOpen ? 'grid grid-cols-[1fr_340px]' : ''}`}>

                {/* ── Video stage ── */}
                <div className="relative flex min-h-0 flex-1 flex-col bg-[#0d0f13]">
                  {activeStageTab === 'whiteboard' ? (
                    showWhiteboardPopup ? (
                      <div className="flex h-full items-center justify-center text-white/40">
                        <div className="text-center">
                          <PenToolIcon className="mx-auto mb-3 size-10 opacity-50" />
                          <p className="font-semibold">Whiteboard opened in popup</p>
                        </div>
                      </div>
                    ) : (
                      <div ref={whiteboardScrollRef} className="h-full overflow-auto bg-[#f8f9ff] p-4">
                        <div
                          ref={whiteboardRef}
                          className={`relative rounded-2xl border border-slate-200 bg-white shadow-inner touch-none ${canEditSharedWhiteboard ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
                          style={{ width: `${boardSize.width}px`, height: `${boardSize.height}px` }}
                          onPointerDown={startDrawing}
                          onPointerMove={continueDrawing}
                          onPointerUp={stopDrawing}
                          onPointerLeave={stopDrawing}
                        >
                          <div
                            className="absolute inset-0 opacity-30"
                            style={{
                              backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.3) 1px, transparent 1px)',
                              backgroundSize: '22px 22px',
                            }}
                          />
                          <svg className="pointer-events-none absolute inset-0 h-full w-full">
                            {renderedStrokes.map((stroke) => (
                              <path
                                key={stroke.id}
                                d={pointsToSvgPath(stroke.points)}
                                fill="none"
                                stroke={stroke.color}
                                strokeWidth={stroke.width}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            ))}
                          </svg>
                          {renderedStrokes.length === 0 && (
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-slate-400">
                              <div>
                                <PenToolIcon className="mx-auto mb-3 size-10 opacity-40" />
                                <p className="font-medium">Start drawing on the whiteboard</p>
                                <p className="mt-1 text-sm">Canvas expands as you draw toward the edges.</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="relative h-full w-full overflow-hidden">
                      <SpeakerLayout VideoPlaceholder={CallVideoPlaceholder} />
                      {isWhiteboardShared && callType === 'video' && (
                        <div className="absolute bottom-28 right-4 h-[120px] w-[200px] overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
                          <SpeakerLayout VideoPlaceholder={CallVideoPlaceholder} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Whiteboard toolbar (appears above controls when whiteboard active) ── */}
                  {activeStageTab === 'whiteboard' && !showWhiteboardPopup && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-4">
                      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-black/60 px-4 py-2 shadow-xl backdrop-blur-md">
                        {isWhiteboardShared && isSharedBoardOwner && (
                          <button onClick={toggleSharedWhiteboardCollaboration} className={`btn btn-xs gap-1.5 ${isSharedWhiteboardCollaborative ? 'btn-secondary' : 'btn-ghost text-white/70'}`}>
                            <PenToolIcon className="size-3" /> {isSharedWhiteboardCollaborative ? 'Collab on' : 'View-only'}
                          </button>
                        )}
                        {isWhiteboardShared && isSharedBoardOwner && (
                          <button onClick={clearWhiteboard} className="btn btn-ghost btn-xs text-white/60 hover:text-red-400" title="Clear">
                            <Trash2Icon className="size-3.5" />
                          </button>
                        )}
                        <button onClick={() => setShowWhiteboardPopup(true)} className="btn btn-ghost btn-xs text-white/60" title="Popout">
                          <MonitorUpIcon className="size-3.5" />
                        </button>
                        {isWhiteboardShared && isSharedBoardOwner && (
                          <button onClick={() => {
                            const blob = new Blob([JSON.stringify(whiteboardStrokes, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url; link.download = `whiteboard-${callId}.json`; link.click();
                            URL.revokeObjectURL(url);
                          }} className="btn btn-ghost btn-xs text-white/60" title="Export"><DownloadIcon className="size-3.5" /></button>
                        )}
                        {isWhiteboardShared && isSharedBoardOwner && (
                          <button onClick={stopWhiteboardShare} className="btn btn-ghost btn-xs text-red-400">Stop sharing</button>
                        )}
                        {!isWhiteboardShared && (
                          <button onClick={shareWhiteboard} className="btn btn-xs btn-primary gap-1.5">
                            <PenToolIcon className="size-3" /> Share to meeting
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Bottom control bar ── */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-6 pt-4"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}
                  >
                    <div className="pointer-events-auto flex items-center justify-center gap-3">
                      {/* Mic */}
                      <button
                        onClick={toggleInCallMicrophone}
                        title={isInCallMicEnabled ? 'Mute' : 'Unmute'}
                        className={`flex size-12 items-center justify-center rounded-full transition-all focus:outline-none
                          ${isInCallMicEnabled
                            ? 'bg-white/15 text-white hover:bg-white/25'
                            : 'bg-red-500 text-white hover:bg-red-600'}`}
                      >
                        {isInCallMicEnabled ? <MicIcon className="size-5" /> : <MicOffIcon className="size-5" />}
                      </button>

                      {/* Camera */}
                      {callType === 'video' && (
                        <button
                          onClick={toggleInCallCamera}
                          title={isInCallCamEnabled ? 'Camera off' : 'Camera on'}
                          className={`flex size-12 items-center justify-center rounded-full transition-all focus:outline-none
                            ${isInCallCamEnabled
                              ? 'bg-white/15 text-white hover:bg-white/25'
                              : 'bg-red-500 text-white hover:bg-red-600'}`}
                        >
                          {isInCallCamEnabled ? <VideoIcon className="size-5" /> : <VideoOffIcon className="size-5" />}
                        </button>
                      )}

                      {/* Screen share */}
                      <InCallScreenShareButton />

                      {/* Whiteboard */}
                      <button
                        onClick={() => {
                          if (activeStageTab === 'whiteboard') {
                            setActiveStageTab('meeting');
                          } else {
                            setShowWhiteboardPopup(true);
                            if (isWhiteboardShared) setActiveStageTab('whiteboard');
                          }
                        }}
                        title="Whiteboard"
                        className={`flex size-12 items-center justify-center rounded-full transition-all focus:outline-none
                          ${activeStageTab === 'whiteboard' || showWhiteboardPopup
                            ? 'bg-violet-500 text-white hover:bg-violet-600'
                            : 'bg-white/15 text-white hover:bg-white/25'}`}
                      >
                        <PenToolIcon className="size-5" />
                      </button>

                      {/* Recording */}
                      <InCallRecordingButton onStateChange={handleRecordingStateChange} />

                      {/* Chat */}
                      <button
                        onClick={() => { setIsSidebarOpen((v) => activeSidebarTab === 'chat' ? !v : true); setActiveSidebarTab('chat'); }}
                        title="Chat"
                        className={`flex size-12 items-center justify-center rounded-full transition-all focus:outline-none
                          ${isSidebarOpen && activeSidebarTab === 'chat'
                            ? 'bg-blue-500 text-white hover:bg-blue-600'
                            : 'bg-white/15 text-white hover:bg-white/25'}`}
                      >
                        <MessageSquareIcon className="size-5" />
                      </button>

                      {/* Participants */}
                      <button
                        onClick={() => { setIsSidebarOpen((v) => activeSidebarTab === 'participants' ? !v : true); setActiveSidebarTab('participants'); }}
                        title="Participants"
                        className={`flex size-12 items-center justify-center rounded-full transition-all focus:outline-none
                          ${isSidebarOpen && activeSidebarTab === 'participants'
                            ? 'bg-blue-500 text-white hover:bg-blue-600'
                            : 'bg-white/15 text-white hover:bg-white/25'}`}
                      >
                        <UsersIcon className="size-5" />
                      </button>

                      {/* Transcript */}
                      <button
                        onClick={() => { setIsSidebarOpen((v) => activeSidebarTab === 'transcript' ? !v : true); setActiveSidebarTab('transcript'); }}
                        title="Transcript"
                        className={`relative flex size-12 items-center justify-center rounded-full transition-all focus:outline-none
                          ${isSidebarOpen && activeSidebarTab === 'transcript'
                            ? 'bg-blue-500 text-white hover:bg-blue-600'
                            : 'bg-white/15 text-white hover:bg-white/25'}`}
                      >
                        <FileTextIcon className="size-5" />
                        {isTranscribing && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-emerald-400 ring-1 ring-black" />}
                      </button>

                      {/* Invite back */}
                      <InCallInviteBackButton members={meetingRoster} onInvite={handleInviteMembersAgain} />

                      {/* Divider */}
                      <span className="h-8 w-px bg-white/15 mx-1" />

                      {/* Leave */}
                      <button onClick={leaveCurrentCall} title="Leave call"
                        className="flex h-12 items-center gap-2 rounded-full bg-red-500 px-5 text-sm font-semibold text-white transition-all hover:bg-red-600 focus:outline-none"
                      >
                        <PhoneOffIcon className="size-4" /> Leave
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Sidebar ── */}
                {isSidebarOpen && (
                  <aside className="flex flex-col overflow-hidden border-l border-white/[0.07] bg-[#161820]">
                    {/* Sidebar header */}
                    <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                      <div className="flex gap-1 rounded-xl bg-white/5 p-1">
                        {[
                          { id: 'chat', icon: <MessageSquareIcon className="size-3.5" />, label: 'Chat' },
                          { id: 'participants', icon: <UsersIcon className="size-3.5" />, label: `People` },
                          { id: 'transcript', icon: <FileTextIcon className="size-3.5" />, label: 'Transcript' },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => setActiveSidebarTab(tab.id)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
                              ${activeSidebarTab === tab.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
                          >
                            {tab.id === 'transcript' && isTranscribing
                              ? <span className="inline-flex size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              : tab.icon}
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setIsSidebarOpen(false)} className="flex size-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors">
                        <XIcon className="size-4" />
                      </button>
                    </div>

                    {/* Sidebar body */}
                    <div className="flex min-h-0 flex-1 flex-col">
                      {activeSidebarTab === 'chat' ? (
                        <>
                          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                            {chatMessages.length === 0 ? (
                              <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                                <div className="flex size-14 items-center justify-center rounded-2xl bg-white/5 mb-4">
                                  <MessageSquareIcon className="size-6 text-white/30" />
                                </div>
                                <p className="text-sm font-medium text-white/50">No messages yet</p>
                                <p className="mt-1 text-xs text-white/30">Share links, notes or quick decisions.</p>
                              </div>
                            ) : (
                              chatMessages.map((message) => {
                                const isOwn = message.userId === user._id;
                                return (
                                  <div key={message.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                                    <span className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                                      {isOwn ? 'You' : message.userName}
                                    </span>
                                    <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm ${isOwn ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/90'}`}>
                                      {message.text}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                            <div ref={messagesEndRef} />
                          </div>
                          <div className="border-t border-white/[0.07] p-3">
                            <div className="flex items-end gap-2">
                              <textarea
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChatMessage(); }}}
                                className="min-h-[72px] flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:border-blue-500/50 focus:bg-white/8 focus:outline-none"
                                placeholder="Message…"
                              />
                              <button onClick={handleSendChatMessage}
                                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                              >
                                <SendIcon className="size-4" />
                              </button>
                            </div>
                          </div>
                        </>
                      ) : activeSidebarTab === 'transcript' ? (
                        <>
                          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex size-2 rounded-full ${isTranscribing ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
                              <span className="text-xs font-medium text-white/50">
                                {isTranscribing ? 'Transcribing live' : 'Paused'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={isTranscribing ? stopTranscription : startTranscription}
                                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${isTranscribing ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'}`}
                              >
                                {isTranscribing ? 'Pause' : 'Resume'}
                              </button>
                              {transcriptEntries.length > 0 && (
                                <button onClick={downloadTranscript} className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                                  <DownloadIcon className="size-3" /> Save
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                            {transcriptEntries.length === 0 && !transcriptDraft ? (
                              <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="flex size-14 items-center justify-center rounded-2xl bg-white/5 mb-4">
                                  <FileTextIcon className="size-6 text-white/30" />
                                </div>
                                <p className="text-sm font-medium text-white/50">No transcript yet</p>
                                <p className="mt-1 text-xs text-white/30">
                                  {(window.SpeechRecognition || window.webkitSpeechRecognition)
                                    ? 'Speak and words appear here in real time.'
                                    : 'Requires Chrome or Edge browser.'}
                                </p>
                              </div>
                            ) : (
                              <>
                                {transcriptEntries.map((entry) => (
                                  <div key={entry.id}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-[11px] font-semibold text-blue-400">
                                        {entry.speakerId === user._id ? 'You' : entry.speakerName}
                                      </span>
                                      <span className="text-[10px] text-white/25">
                                        {new Date(entry.timestamp).toLocaleTimeString()}
                                      </span>
                                    </div>
                                    <p className="text-sm leading-relaxed text-white/75">{entry.text}</p>
                                  </div>
                                ))}
                                {transcriptDraft && (
                                  <div className="opacity-50">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-[11px] font-semibold text-blue-400">You</span>
                                      <span className="text-[10px] italic text-white/25">speaking…</span>
                                    </div>
                                    <p className="text-sm italic leading-relaxed text-white/55">{transcriptDraft}</p>
                                  </div>
                                )}
                                <div ref={transcriptEndRef} />
                              </>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                          <p className="mb-3 text-xs text-white/30">
                            {meetingRoster.length} participant{meetingRoster.length !== 1 ? 's' : ''}
                          </p>
                          {meetingRoster.map((member, index) => (
                            <div key={`${member.id}-${index}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5 transition-colors">
                              <Avatar src={member.image} name={member.name} size="w-9 h-9" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-white/85">{member.isYou ? 'You' : member.name}</p>
                                <p className="text-[11px] text-white/35">{member.isYou ? 'You (local)' : 'In call'}</p>
                              </div>
                              {!member.isYou && (
                                <button
                                  onClick={() => handleInviteMembersAgain([member])}
                                  className="rounded-lg px-2.5 py-1 text-xs text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                                >
                                  Invite back
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </aside>
                )}
              </div>

              {showWhiteboardPopup && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-2 sm:p-6">
                  <div className="flex h-full max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-2xl">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-200 px-4 py-4 sm:px-5">
                      <div>
                        <div className="badge badge-outline mb-2">{popupBoardTitle}</div>
                        <h3 className="text-lg font-bold text-base-content">Infinite-style workspace</h3>
                        <p className="text-sm text-base-content/55">{popupBoardDescription}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {WHITEBOARD_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => setBrushColor(color)}
                            className={`h-9 w-9 rounded-full border-2 transition ${brushColor === color ? 'border-base-content scale-110' : 'border-base-200'}`}
                            style={{ backgroundColor: color }}
                            title={`Brush ${color}`}
                          />
                        ))}

                        <select
                          value={brushWidth}
                          onChange={(event) => setBrushWidth(Number(event.target.value))}
                          className="select select-bordered select-sm w-28"
                        >
                          {[2, 3, 4, 6].map((width) => (
                            <option key={width} value={width}>{width}px</option>
                          ))}
                        </select>

                        {isWhiteboardShared && isSharedBoardOwner && (
                          <button onClick={toggleSharedWhiteboardCollaboration} className={`btn btn-sm gap-2 ${isSharedWhiteboardCollaborative ? 'btn-secondary' : 'btn-ghost'}`}>
                            <PenToolIcon className="size-4" /> {isSharedWhiteboardCollaborative ? 'Others can edit' : 'View only for others'}
                          </button>
                        )}
                        {(!isWhiteboardShared || isSharedBoardOwner) && (
                          <button onClick={clearWhiteboard} className="btn btn-ghost btn-sm gap-2 text-error">
                            <Trash2Icon className="size-4" /> Clear
                          </button>
                        )}
                        {!isWhiteboardShared && (
                          <button onClick={shareWhiteboard} className="btn btn-primary btn-sm gap-2">
                            <PenToolIcon className="size-4" /> Share to meeting
                          </button>
                        )}
                        {isWhiteboardShared && isSharedBoardOwner && (
                          <button onClick={stopWhiteboardShare} className="btn btn-ghost btn-sm gap-2 text-error">
                            <PenToolIcon className="size-4" /> Stop sharing
                          </button>
                        )}
                        <button onClick={() => setShowWhiteboardPopup(false)} className="btn btn-primary btn-sm gap-2">
                          <XIcon className="size-4" /> Close
                        </button>
                      </div>
                    </div>

                    <div className="border-b border-base-200 px-4 py-3 text-sm text-base-content/55 sm:px-5">
                      {isWhiteboardShared
                        ? 'Scroll in any direction and keep drawing. The board expands automatically when you approach an edge.'
                        : 'Your personal board stays private until you decide to share it with the meeting.'}
                    </div>

                    {isWhiteboardShared && (
                      <div className="border-b border-base-200 px-4 py-3 text-sm text-base-content/60 sm:px-5">
                        {isSharedBoardOwner
                          ? (isSharedWhiteboardCollaborative ? 'Participants can draw on your shared whiteboard.' : 'Others can view your shared whiteboard, but only you can edit it.')
                          : (isSharedWhiteboardCollaborative ? `${sharedWhiteboardOwnerName || 'The owner'} allows participants to draw on this whiteboard.` : `${sharedWhiteboardOwnerName || 'The owner'} shared this whiteboard in view-only mode.`)}
                      </div>
                    )}

                    <div ref={whiteboardScrollRef} className="min-h-0 flex-1 overflow-auto bg-base-200/60 p-4 sm:p-6">
                      <div
                        ref={whiteboardRef}
                        className={`relative rounded-3xl border border-base-300 bg-white shadow-inner touch-none ${isPersonalWhiteboardOpen || canEditSharedWhiteboard ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
                        style={{ width: `${activeBoardSize.width}px`, height: `${activeBoardSize.height}px` }}
                        onPointerDown={startDrawing}
                        onPointerMove={continueDrawing}
                        onPointerUp={stopDrawing}
                        onPointerLeave={stopDrawing}
                      >
                        <svg className="pointer-events-none absolute inset-0 h-full w-full">
                          {activeRenderedStrokes.map((stroke) => (
                            <path
                              key={stroke.id}
                              d={pointsToSvgPath(stroke.points)}
                              fill="none"
                              stroke={stroke.color}
                              strokeWidth={stroke.width}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          ))}
                        </svg>

                        {activeRenderedStrokes.length === 0 && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-base-content/35">
                            <div>
                              <PenToolIcon className="mx-auto mb-3 size-10" />
                              <p className="font-medium">{isWhiteboardShared ? 'Start drawing on the whiteboard' : 'Start sketching on your private board'}</p>
                              <p className="mt-1 text-sm">Open more space just by drawing toward the edges.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            </StreamCall>
          </StreamVideo>
        ) : (
          /* ── Pre-join screen ── */
          <div className="flex h-full w-full items-center justify-center bg-[#0d0f13] p-4">
            <div className="grid h-full w-full max-w-5xl overflow-hidden rounded-2xl border border-white/[0.07] bg-[#161820] shadow-2xl lg:h-auto lg:grid-cols-[1.1fr_0.9fr]">
              {/* Left: camera preview */}
              <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden bg-[#0a0b0e] sm:min-h-[400px]">
                {callType === 'video' && previewStream ? (
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover scale-x-[-1]"
                  />
                ) : (
                  <div className="text-center px-8">
                    {callType === 'video'
                      ? <VideoOffIcon className="size-14 mx-auto mb-4 text-white/30" />
                      : <MicIcon className="size-14 mx-auto mb-4 text-white/30" />}
                    <p className="text-base font-semibold text-white/70">
                      {callType === 'video' ? 'Camera preview is off' : 'Voice call ready'}
                    </p>
                    <p className="text-sm text-white/35 mt-2">
                      {previewError || 'Choose how you want to join before entering the call.'}
                    </p>
                  </div>
                )}
                {/* Preview mic/cam toggles */}
                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-3">
                  <button
                    onClick={() => setIsMicEnabled((v) => !v)}
                    title={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
                    className={`flex size-11 items-center justify-center rounded-full transition-all focus:outline-none
                      ${isMicEnabled ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-red-500 text-white hover:bg-red-600'}`}
                  >
                    {isMicEnabled ? <MicIcon className="size-5" /> : <MicOffIcon className="size-5" />}
                  </button>
                  {callType === 'video' && (
                    <button
                      onClick={() => setIsCamEnabled((v) => !v)}
                      title={isCamEnabled ? 'Turn camera off' : 'Turn camera on'}
                      className={`flex size-11 items-center justify-center rounded-full transition-all focus:outline-none
                        ${isCamEnabled ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-red-500 text-white hover:bg-red-600'}`}
                    >
                      {isCamEnabled ? <VideoIcon className="size-5" /> : <VideoOffIcon className="size-5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Right: join settings */}
              <div className="flex flex-col justify-center overflow-y-auto p-6 sm:p-8">
                <span className="inline-flex w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50 mb-4">
                  {callType === 'video' ? 'Video Call' : 'Voice Call'}
                </span>
                <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready to join?</h2>
                <p className="mt-2 text-sm text-white/45">
                  Joining with {isMicEnabled ? 'microphone on' : 'microphone off'}
                  {callType === 'video' ? ` · camera ${isCamEnabled ? 'on' : 'off'}` : ''}.
                </p>

                <div className="mt-5 space-y-2.5">
                  <div className="rounded-xl bg-white/[0.05] border border-white/[0.06] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/35">Participants</p>
                    <p className="mt-1 text-sm font-medium text-white/80">{participantNames.length ? participantNames.join(', ') : 'Team call'}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.05] border border-white/[0.06] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/35">Status</p>
                    <p className="mt-1 text-sm font-medium text-white/80">{isInitiator ? 'Starting a ringing call' : 'Joining an incoming call'}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.05] border border-white/[0.06] px-4 py-3 space-y-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/35">Devices</p>
                    <div>
                      <p className="text-xs text-white/40 mb-1">Microphone</p>
                      <select
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                        value={selectedMicId}
                        onChange={(e) => setSelectedMicId(e.target.value)}
                      >
                        {audioDevices.map((device, index) => (
                          <option key={device.deviceId || index} value={device.deviceId} className="bg-[#161820]">
                            {device.label || `Microphone ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    {callType === 'video' && videoDevices.length > 0 && (
                      <div>
                        <p className="text-xs text-white/40 mb-1">Camera</p>
                        <select
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                          value={selectedCameraId}
                          onChange={(e) => setSelectedCameraId(e.target.value)}
                        >
                          {videoDevices.map((device, index) => (
                            <option key={device.deviceId || index} value={device.deviceId} className="bg-[#161820]">
                              {device.label || `Camera ${index + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {speakerDevices.length > 0 && (
                      <div>
                        <p className="text-xs text-white/40 mb-1">Speaker / Output</p>
                        <select
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                          value={selectedSpeakerId}
                          onChange={(e) => setSelectedSpeakerId(e.target.value)}
                        >
                          {speakerDevices.map((device, index) => (
                            <option key={device.deviceId || index} value={device.deviceId} className="bg-[#161820]">
                              {device.label || `Speaker ${index + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <button onClick={onClose}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white/60 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={joinCall}
                    disabled={isJoining}
                    className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                  >
                    {isJoining ? 'Joining…' : 'Join now'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default VideoCallModal;
