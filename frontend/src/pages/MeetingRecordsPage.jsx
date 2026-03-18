import { useState, useMemo } from "react";
import { getTranscript, getTranscriptSummary, getCallLogsApi } from "../lib/api";
import useAuthUser from "../hooks/useAuthUser";
import { CalendarDays, Clock, Download, FileText, Users, Video, Phone, History, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";
import Avatar from "../components/Avatar";
import { useQuery } from "@tanstack/react-query";
import ChatLoader from "../components/ChatLoader";

const formatDuration = (startTime, endTime) => {
  if (!startTime || !endTime) return "Ongoing";
  const duration = Math.max(0, Math.floor((new Date(endTime) - new Date(startTime)) / 1000));
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
};

const getHostProfile = (log, authUser) => {
  // If the log explicitly tracks a host
  if (log.hostId) {
    if (log.hostId === authUser?._id) return { id: authUser._id, name: "You", image: authUser.profilePic };
    const p = log.participantProfiles?.find(p => p.id === log.hostId);
    if (p) return p;
  }

  // Fallback to the first available participant if host isn't declared
  if (Array.isArray(log?.participantProfiles) && log.participantProfiles.length > 0) {
    const nonSelf = log.participantProfiles.find(p => p.id !== authUser?._id);
    return nonSelf || log.participantProfiles[0];
  }

  const [name] = log?.participants || [];
  return {
    id: log?.participantIds?.[0] || name || 'unknown',
    name: name || 'Unknown participant',
    image: '',
  };
};

const getChannelName = (log) => {
  // 1. Prefer the stored human-readable name (always accurate)
  if (log?.conversationName) return log.conversationName;

  if (!log?.conversationId) return null;

  const rawId = String(log.conversationId);

  // 2. Stream channel IDs look like `org-slug-channelname`.
  //    Take the last hyphen segment, but skip pure timestamps (all digits).
  const partsByDash = rawId.split("-").filter(Boolean);
  for (let i = partsByDash.length - 1; i >= 0; i--) {
    const part = partsByDash[i];
    if (/^\d+$/.test(part)) continue; // skip timestamp-like segments
    if (/^[0-9a-f]{20,}$/i.test(part)) continue; // skip ObjectId-like segments
    return part.charAt(0).toUpperCase() + part.slice(1);
  }

  return null;
};

const resolveIsChannelCall = (log) => {
  if (typeof log?.isChannel === "boolean") return log.isChannel;

  const conversationId = String(log?.conversationId || "");
  if (!conversationId) return false;

  if (conversationId.includes("!members-")) return false;
  if (conversationId.includes(":")) return true;

  // If there are several non-self participants, this is most likely a channel call.
  if (Array.isArray(log?.participantIds) && log.participantIds.length > 2) return true;
  if (Array.isArray(log?.participantProfiles) && log.participantProfiles.length > 2) return true;

  return false;
};

const getDisplayName = (log, authUser) => {
  const isChannelCall = resolveIsChannelCall(log);
  if (isChannelCall) {
    const channelName = getChannelName(log);
    return channelName ? `#${channelName}` : "Channel Meeting";
  }
  // For personal calls show the other party's name, not all participants
  const otherParticipants = (log.participantProfiles || [])
    .filter((p) => p && p.id !== authUser?._id)
    .map((p) => p.name)
    .filter(Boolean);
  if (otherParticipants.length > 0) return otherParticipants.join(", ");
  if (log.participants?.length > 0) return log.participants.join(", ");
  return "Personal Call";
};

const MeetingRecordsPage = () => {
  const { authUser } = useAuthUser();
  const [isDownloading, setIsDownloading] = useState(false);
  const [expandedSummaryId, setExpandedSummaryId] = useState(null);
  const [summaries, setSummaries] = useState({});
  const [isSummarizing, setIsSummarizing] = useState({});

  const { data: callLogs = [], isLoading } = useQuery({
    queryKey: ["callLogs"],
    queryFn: getCallLogsApi,
    enabled: !!authUser,
  });

  // Filter logs: mirror previous logic but now using backend data
  const myMeetings = useMemo(() => {
    return callLogs.filter(log => log.status !== 'ringing');
  }, [callLogs]);

  const handleDownloadTranscript = async (log) => {
    try {
      if (!log.callId) {
        toast.error("No valid call reference found.");
        return;
      }
      setIsDownloading(true);
      
      const response = await getTranscript(log.callId);
      
      if (!response || !response.cloudinaryUrl) {
        toast.error("Transcript file could not be generated.");
        setIsDownloading(false);
        return;
      }

      const link = document.createElement('a');
      link.href = response.cloudinaryUrl;
      link.target = "_blank";
      link.download = `Transcript-${log.callId}.txt`;
      link.click();
      
      toast.success("Transcript downloaded");
      setIsDownloading(false);
    } catch (error) {
      console.error("Error downloading transcript:", error);
      setIsDownloading(false);
      if (error?.response?.status === 404) {
        toast.error("No transcript available for this meeting.");
      } else {
        toast.error("Failed to download transcript.");
      }
    }
  };

  const handleToggleSummary = async (log) => {
    if (expandedSummaryId === log.callId) {
      setExpandedSummaryId(null);
      return;
    }

    setExpandedSummaryId(log.callId);
    if (summaries[log.callId]) return;

    try {
      setIsSummarizing(prev => ({ ...prev, [log.callId]: true }));
      const response = await getTranscriptSummary(log.callId);
      
      if (response && response.summary) {
        setSummaries(prev => ({ ...prev, [log.callId]: response.summary }));
      } else {
        toast.error("Summary could not be generated.");
        setExpandedSummaryId(null);
      }
    } catch (error) {
      console.error("Error fetching summary:", error);
      if (error?.response?.status === 404) {
        toast.error("No transcript available to summarize.");
      } else {
        toast.error(error?.response?.data?.message || "Failed to generate summary.");
      }
      setExpandedSummaryId(null);
    } finally {
      setIsSummarizing(prev => ({ ...prev, [log.callId]: false }));
    }
  };

  if (isLoading) return <ChatLoader />;

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10 w-full h-full overflow-y-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-primary/10 text-primary rounded-xl">
          <FileText className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-base-content leading-tight">Meeting Records</h1>
          <p className="text-base-content/60 text-sm mt-1">Review your past calls and download transcripts</p>
        </div>
      </div>

      {myMeetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center border-2 border-dashed border-base-300 rounded-3xl bg-base-100/50">
          <div className="w-16 h-16 bg-base-200 rounded-full flex items-center justify-center mb-4 text-base-content/30">
            <History className="size-8" />
          </div>
          <h3 className="text-lg font-bold text-base-content mb-2">No meeting records found</h3>
          <p className="text-base-content/60 max-w-sm">
            You haven't participated in any recorded calls yet. Start a video or voice call to see it here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {myMeetings.map((log) => {
            const date = new Date(log.startTime || log.createdAt || log.updatedAt || new Date());
            const hostProfile = getHostProfile(log, authUser);
            const profiles = log.participantProfiles || [];
            const isChannelCall = resolveIsChannelCall(log);
            
            return (
              <div key={log.callId} className="flex flex-col gap-2">
                <div className="bg-base-100 border border-base-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row sm:items-center gap-5">
                  <div className="flex flex-row sm:flex-col items-center sm:items-start gap-3 sm:gap-1 min-w-[120px] shrink-0">
                    <div className="text-sm font-bold text-base-content/80 bg-base-200 px-3 py-1 rounded-lg">
                      {date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="flex items-center gap-1.5 text-base-content/60 text-sm font-medium mt-1 sm:px-1">
                      <Clock className="size-3.5" />
                      <span>{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {log.type === 'video' ? <Video className="size-4 text-primary" /> : <Phone className="size-4 text-success" />}
                      <h3 className="text-lg font-bold text-base-content truncate">
                        {getDisplayName(log, authUser)}
                      </h3>
                      
                      {/* Status/Direction Tags */}
                      <div className="flex items-center gap-1.5 ml-1">
                        {log.status === 'missed' ? (
                          <span className="badge badge-error badge-sm font-bold gap-1 px-2">Missed</span>
                        ) : log.hostId === authUser?._id ? (
                          <span className="badge badge-info badge-sm font-bold gap-1 px-2">Outgoing</span>
                        ) : (
                          <span className="badge badge-success badge-sm font-bold gap-1 px-2">Incoming</span>
                        )}
                        
                        {isChannelCall ? (
                          <span className="badge badge-outline badge-sm border-primary/30 text-primary font-bold px-2">
                            {`#${getChannelName(log) || "channel"}`}
                          </span>
                        ) : (
                          <span className="badge badge-outline badge-sm border-base-content/20 text-base-content/60 font-medium px-2">Personal</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-base-content/70">
                      <div className="flex items-center gap-1.5 bg-base-200/50 px-2 py-0.5 rounded-md">
                        <CalendarDays className="size-3.5 opacity-60" />
                        <span>{formatDuration(log.startTime, log.endTime)}</span>
                      </div>
                      
                      {hostProfile && hostProfile.name !== "Unknown participant" && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold uppercase tracking-wider text-base-content/40">Host:</span>
                          <div className="flex items-center gap-1.5">
                            <Avatar src={hostProfile?.image} name={hostProfile?.name} size="w-5 h-5" rounded="rounded-md" />
                            <span className="font-medium truncate max-w-[100px]">{hostProfile?.name}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 sm:border-l border-base-300 pt-4 sm:pt-0 sm:pl-5">
                    {profiles.length > 0 && (
                      <div className="flex -space-x-1.5 mb-2" title={`${profiles.length} participants`}>
                        {profiles.slice(0, 4).map((p) => (
                          <Avatar key={p.id} src={p.image} name={p.name} size="w-7 h-7" className="border-2 border-base-100 shadow-sm" />
                        ))}
                        {profiles.length > 4 && (
                          <div className="w-7 h-7 rounded-full bg-base-200 border-2 border-base-100 flex items-center justify-center text-[10px] font-bold text-base-content/70 z-10">
                            +{profiles.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button 
                        onClick={() => handleToggleSummary(log)}
                        disabled={log.status === 'ringing' || log.status === 'started' || isSummarizing[log.callId]}
                        className={`btn btn-sm flex-1 sm:flex-none btn-outline ${expandedSummaryId === log.callId ? 'bg-primary/10 text-primary border-primary/30' : 'border-base-300 hover:bg-primary/10 hover:text-primary hover:border-primary/30'}`}
                        title={log.status === 'ringing' || log.status === 'started' ? 'Call must finish before summary is available' : ''}
                      >
                        {isSummarizing[log.callId] ? (
                          <span className="loading loading-spinner w-3.5 h-3.5" />
                        ) : (
                          <Sparkles className="size-3.5" />
                        )}
                        Summary
                        {expandedSummaryId === log.callId ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                      </button>
                      <button 
                        onClick={() => handleDownloadTranscript(log)}
                        disabled={isDownloading || log.status === 'ringing' || log.status === 'started'}
                        className="btn btn-sm flex-1 sm:flex-none btn-outline border-base-300 hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                        title={log.status === 'ringing' || log.status === 'started' ? 'Call must finish before transcript is available' : ''}
                      >
                        <Download className="size-3.5" />
                        Transcript
                      </button>
                    </div>
                  </div>
                </div>
                
                {expandedSummaryId === log.callId && (
                  <div className="mt-2 p-5 bg-gradient-to-br from-primary/5 to-transparent border border-primary/20 rounded-2xl text-base-content/80 text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1">
                    <div className="flex items-center gap-2 mb-3 text-primary font-bold">
                      <Sparkles className="size-4" />
                      <h4>AI Meeting Summary</h4>
                    </div>
                    {isSummarizing[log.callId] ? (
                      <div className="animate-pulse flex flex-col gap-2">
                        <div className="h-4 bg-primary/10 rounded w-3/4"></div>
                        <div className="h-4 bg-primary/10 rounded w-1/2"></div>
                        <div className="h-4 bg-primary/10 rounded w-5/6"></div>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{summaries[log.callId]}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MeetingRecordsPage;

