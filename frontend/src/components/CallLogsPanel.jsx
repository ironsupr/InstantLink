import { useEffect, useMemo, useState } from 'react';
import { HistoryIcon, PhoneIcon, PhoneMissedIcon, RadioIcon, VideoIcon, XIcon } from 'lucide-react';
import Avatar from './Avatar';
import { clearCallLogs, getCallLogs, isCallOngoing, subscribeToCallStore } from '../lib/callHistory';

const startOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const formatSectionLabel = (timestamp) => {
  const date = new Date(timestamp);
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const entryDay = startOfDay(date);

  if (entryDay.getTime() === today.getTime()) return 'Today';
  if (entryDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
};

const formatDuration = (startTime, endTime) => {
  if (!startTime || !endTime) return 'Ongoing';
  const duration = Math.max(0, Math.floor((new Date(endTime) - new Date(startTime)) / 1000));
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
};

const formatTime = (timestamp) =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const getLeadParticipant = (log) => {
  if (Array.isArray(log?.participantProfiles) && log.participantProfiles.length > 0) {
    return log.participantProfiles[0];
  }

  const [name] = log?.participants || [];
  return {
    id: log?.participantIds?.[0] || name || 'unknown',
    name: name || 'Unknown participant',
    image: '',
  };
};

const CallLogsPanel = ({ isOpen, onClose, onCallBack, onRejoin, conversationId }) => {
  const [callLogs, setCallLogs] = useState([]);
  const [filter, setFilter] = useState('all'); // all, video, voice, missed

  useEffect(() => {
    if (!isOpen) return undefined;

    const refresh = () => setCallLogs(getCallLogs());
    refresh();

    return subscribeToCallStore(refresh);
  }, [isOpen]);

  const filteredLogs = useMemo(() => callLogs.filter((log) => {
    if (conversationId && log.conversationId && log.conversationId !== conversationId) return false;
    if (filter === 'all') return true;
    if (filter === 'video') return log.type === 'video';
    if (filter === 'voice') return log.type === 'voice' || log.type === 'audio';
    if (filter === 'missed') return log.status === 'missed';
    return true;
  }), [callLogs, conversationId, filter]);

  const groupedLogs = useMemo(() => filteredLogs.reduce((groups, log) => {
    const section = formatSectionLabel(log.updatedAt || log.startTime || new Date().toISOString());
    if (!groups[section]) groups[section] = [];
    groups[section].push(log);
    return groups;
  }, {}), [filteredLogs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-base-100 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-base-300 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-base-content">Call History</h2>
            <p className="text-sm text-base-content/60 mt-1">
              {conversationId ? `${filteredLogs.length} calls in this chat` : `${callLogs.length} total calls`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-circle"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-base-300">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('video')}
              className={`btn btn-sm ${filter === 'video' ? 'btn-primary' : 'btn-ghost'}`}
            >
              <VideoIcon className="size-4" />
              Video
            </button>
            <button
              onClick={() => setFilter('voice')}
              className={`btn btn-sm ${filter === 'voice' ? 'btn-primary' : 'btn-ghost'}`}
            >
              <PhoneIcon className="size-4" />
              Voice
            </button>
            <button
              onClick={() => setFilter('missed')}
              className={`btn btn-sm ${filter === 'missed' ? 'btn-error' : 'btn-ghost'}`}
            >
              Missed
            </button>
            <div className="flex-1"></div>
            {callLogs.length > 0 && (
              <button
                onClick={clearCallLogs}
                className="btn btn-sm btn-ghost text-error"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Call Logs List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <HistoryIcon className="size-16 mx-auto text-base-content/20 mb-4" />
              <p className="text-base-content/60 text-lg">No call history</p>
              <p className="text-base-content/40 text-sm mt-2">
                {filter !== 'all' ? 'Try changing the filter' : 'Start a call to see it here'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedLogs).map(([section, logs]) => (
                <section key={section} className="space-y-2">
                  <div className="sticky top-0 z-10 bg-base-100/95 py-1 text-xs font-bold uppercase tracking-[0.22em] text-base-content/40 backdrop-blur">
                    {section}
                  </div>
                  {logs.map((log) => {
                    const leadParticipant = getLeadParticipant(log);
                    const ongoing = isCallOngoing(log);
                    const statusTone = log.status === 'missed'
                      ? 'text-error'
                      : ongoing
                        ? 'text-success'
                        : 'text-base-content/60';

                    return (
                      <div
                        key={log.callId}
                        className="flex items-center gap-3 rounded-2xl border border-base-300 bg-base-100 px-3 py-3 shadow-sm transition hover:bg-base-200/40"
                      >
                        <div className="relative">
                          <Avatar src={leadParticipant.image} name={leadParticipant.name} size="w-12 h-12" />
                          <div className={`absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-base-100 ${log.type === 'video' ? 'bg-primary text-primary-content' : 'bg-success text-success-content'}`}>
                            {log.type === 'video' ? <VideoIcon className="size-3.5" /> : <PhoneIcon className="size-3.5" />}
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate font-semibold text-base-content">
                              {(log.participants?.length ? log.participants : [leadParticipant.name]).join(', ')}
                            </h3>
                            {log.recorded && (
                              <span className="badge badge-sm badge-error gap-1">
                                <RadioIcon className="size-3" />
                                Recorded
                              </span>
                            )}
                            {ongoing && <span className="badge badge-sm badge-success">Live</span>}
                          </div>
                          <div className={`mt-1 flex flex-wrap items-center gap-2 text-sm ${statusTone}`}>
                            {log.status === 'missed' ? <PhoneMissedIcon className="size-3.5" /> : log.type === 'video' ? <VideoIcon className="size-3.5" /> : <PhoneIcon className="size-3.5" />}
                            <span className="capitalize">{ongoing ? 'Ongoing call' : log.status || 'ended'}</span>
                            <span className="text-base-content/35">•</span>
                            <span className="text-base-content/55">{formatTime(log.startTime)}</span>
                            <span className="text-base-content/35">•</span>
                            <span className="text-base-content/55">{formatDuration(log.startTime, log.endTime)}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            if (ongoing) {
                              onRejoin?.(log);
                            } else {
                              onCallBack?.(log);
                            }
                            onClose();
                          }}
                          className={`btn btn-circle btn-sm ${ongoing ? 'btn-success' : 'btn-ghost'}`}
                          title={ongoing ? 'Rejoin call' : 'Call back'}
                        >
                          {log.type === 'video' ? <VideoIcon className="size-4" /> : <PhoneIcon className="size-4" />}
                        </button>
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallLogsPanel;
