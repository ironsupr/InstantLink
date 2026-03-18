import { useEffect } from "react";
import { PhoneIcon, PhoneOffIcon, SmartphoneIcon, Volume2Icon, XIcon, HashIcon, BellIcon, BellOffIcon, PinIcon, SearchIcon } from "lucide-react";
import { useStreamContext } from "../context/StreamContext";
import Avatar from "./Avatar";
import { getPresenceMeta } from "../lib/presenceUtils";

const ChannelInfoPanel = ({ channel, isChannel, isOpen, onClose }) => {
  const { getConversationPrefs, isMessageMuted, isCallMuted, toggleNotificationMute, updateConversationCallSetting, getUserPresence, refreshUserPresence } = useStreamContext();

  if (!isOpen) return null;

  const conversationId = channel?.id;
  const messagesMuted = isMessageMuted(conversationId);
  const callsMuted = isCallMuted(conversationId);
  const conversationPrefs = getConversationPrefs(conversationId);

  const otherMember = !isChannel && channel?.state?.members 
    ? Object.values(channel.state.members).find(m => m.user_id !== channel._client?.userID)
    : null;
  const otherMemberUser = getUserPresence(otherMember?.user_id, otherMember?.user);
  const otherMemberPresence = getPresenceMeta(otherMemberUser);

  useEffect(() => {
    if (!isOpen || !otherMember?.user_id) return;
    refreshUserPresence([otherMember.user_id]);
  }, [isOpen, otherMember?.user_id, refreshUserPresence]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div 
        className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-base-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isChannel ? (
              <>
                <div className="bg-primary/10 p-2 rounded-lg">
                  <HashIcon className="size-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{channel?.data?.name}</h3>
                  <p className="text-xs text-base-content/50">Channel Details</p>
                </div>
              </>
            ) : (
              <>
                <Avatar
                  src={otherMemberUser?.image || otherMember?.user?.image}
                  name={otherMemberUser?.name || otherMember?.user?.name}
                  size="w-12 h-12"
                  className="ring ring-primary/10 ring-offset-base-100 ring-offset-2"
                />
                <div>
                  <h3 className="font-bold text-lg">{otherMemberUser?.name || otherMember?.user?.name}</h3>
                  <p className={`text-xs flex items-center gap-1 ${otherMemberPresence.textClassName}`}>
                    <span className={`size-2 rounded-full inline-block ${otherMemberPresence.dotClassName}`} />
                    {otherMemberPresence.label}
                  </p>
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
            <XIcon className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(80vh-100px)] p-6 space-y-6">
          {/* About Section */}
          <div>
            <h4 className="font-bold mb-3 text-sm uppercase tracking-wide text-base-content/50">About</h4>
            <p className="text-sm text-base-content/70">
              {isChannel 
                ? `This is the ${channel?.data?.name} channel for team collaboration and discussions.`
                : `Direct message conversation with ${otherMember?.user?.name}.`
              }
            </p>
          </div>

          <div>
            <h4 className="font-bold mb-3 text-sm uppercase tracking-wide text-base-content/50">Settings Summary</h4>
            <div className="rounded-2xl bg-base-200 p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <span className={`badge ${messagesMuted ? 'badge-warning' : 'badge-success'} gap-1`}>
                  {messagesMuted ? <BellOffIcon className="size-3" /> : <BellIcon className="size-3" />}
                  {messagesMuted ? 'Messages muted' : 'Messages on'}
                </span>
                <span className={`badge ${callsMuted ? 'badge-warning' : 'badge-success'} gap-1`}>
                  {callsMuted ? <PhoneOffIcon className="size-3" /> : <PhoneIcon className="size-3" />}
                  {callsMuted ? 'Calls muted' : 'Calls on'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-base-content/70">
                <span className="flex items-center gap-2"><Volume2Icon className="size-4" /> Ringtone volume</span>
                <span>{Math.round((conversationPrefs.ringtoneVolume ?? 0.6) * 100)}%</span>
              </div>
              <div className="flex items-center justify-between text-sm text-base-content/70">
                <span className="flex items-center gap-2"><SmartphoneIcon className="size-4" /> Vibration</span>
                <span>{conversationPrefs.vibrate ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div>
            <h4 className="font-bold mb-3 text-sm uppercase tracking-wide text-base-content/50">Actions</h4>
            <div className="space-y-2">
              <button 
                className="btn btn-ghost justify-start w-full"
                onClick={() => toggleNotificationMute(conversationId, "messages")}
              >
                {messagesMuted ? (
                  <><BellIcon className="size-4" /> Unmute Notifications</>
                ) : (
                  <><BellOffIcon className="size-4" /> Mute Message Notifications</>
                )}
              </button>
              <button 
                className="btn btn-ghost justify-start w-full"
                onClick={() => toggleNotificationMute(conversationId, "calls")}
              >
                {callsMuted ? (
                  <><PhoneIcon className="size-4" /> Unmute Call Notifications</>
                ) : (
                  <><PhoneOffIcon className="size-4" /> Mute Call Notifications</>
                )}
              </button>
              <button className="btn btn-ghost justify-start w-full">
                <PinIcon className="size-4" />
                View Pinned Messages
              </button>
              <button className="btn btn-ghost justify-start w-full">
                <SearchIcon className="size-4" />
                Search in Conversation
              </button>
            </div>
          </div>

          <div>
            <h4 className="font-bold mb-3 text-sm uppercase tracking-wide text-base-content/50">Call Alerts</h4>
            <div className="space-y-4 rounded-2xl bg-base-200 p-4">
              <label className="form-control">
                <div className="label pb-2">
                  <span className="label-text flex items-center gap-2"><Volume2Icon className="size-4" /> Ringtone volume</span>
                  <span className="label-text-alt">{Math.round((conversationPrefs.ringtoneVolume ?? 0.6) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round((conversationPrefs.ringtoneVolume ?? 0.6) * 100)}
                  onChange={(e) => updateConversationCallSetting(conversationId, "ringtoneVolume", Number(e.target.value) / 100)}
                  className="range range-primary range-sm"
                />
              </label>

              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={!!conversationPrefs.vibrate}
                  onChange={(e) => updateConversationCallSetting(conversationId, "vibrate", e.target.checked)}
                />
                <span className="label-text flex items-center gap-2"><SmartphoneIcon className="size-4" /> Vibrate on incoming call</span>
              </label>
            </div>
          </div>

          {/* Stats */}
          {isChannel && (
            <div>
              <h4 className="font-bold mb-3 text-sm uppercase tracking-wide text-base-content/50">Statistics</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-base-200 p-4 rounded-xl text-center">
                  <div className="text-2xl font-bold text-primary">
                    {channel?.state?.members ? Object.keys(channel.state.members).length : 0}
                  </div>
                  <div className="text-xs text-base-content/60 mt-1">Members</div>
                </div>
                <div className="bg-base-200 p-4 rounded-xl text-center">
                  <div className="text-2xl font-bold text-secondary">
                    {channel?.state?.messages?.length || 0}
                  </div>
                  <div className="text-xs text-base-content/60 mt-1">Messages</div>
                </div>
              </div>
            </div>
          )}

          {/* Created Info */}
          <div className="pt-4 border-t border-base-300">
            <p className="text-xs text-base-content/50">
              Created {channel?.data?.created_at ? new Date(channel.data.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'recently'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChannelInfoPanel;
