import { useState, useEffect } from "react";
import { XIcon, UsersIcon } from "lucide-react";
import Avatar from "./Avatar";
import { useStreamContext } from "../context/StreamContext";
import { getPresenceMeta } from "../lib/presenceUtils";

const ChannelMembersPanel = ({ channel, isOpen, onClose }) => {
  const [members, setMembers] = useState([]);
  const { getUserPresence, refreshUserPresence } = useStreamContext();

  useEffect(() => {
    if (channel && isOpen) {
      const membersList = Object.values(channel.state.members || {});
      setMembers(membersList);
      refreshUserPresence(membersList.map((member) => member.user_id).filter(Boolean));
    }
  }, [channel, isOpen, refreshUserPresence]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div 
        className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-base-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <UsersIcon className="size-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Channel Members</h3>
              <p className="text-xs text-base-content/50">{members.length} total members</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
            <XIcon className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(80vh-100px)] p-6 space-y-3">
          {members.map((member) => {
            const presenceUser = getUserPresence(member.user_id, member.user);
            const presenceMeta = getPresenceMeta(presenceUser);

            return (
            <div 
              key={member.user_id} 
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-base-200 transition-colors"
            >
              <Avatar
                src={presenceUser?.image || member.user?.image}
                name={presenceUser?.name || member.user?.name}
                size="w-12 h-12"
                className="ring ring-primary/10 ring-offset-base-100 ring-offset-2"
              />
              <div className="flex-1">
                <h4 className="font-bold">{presenceUser?.name || member.user?.name}</h4>
                <p className={`text-xs flex items-center gap-1 ${presenceMeta.textClassName}`}>
                  <span className={`size-2 rounded-full inline-block ${presenceMeta.dotClassName}`} />
                  {presenceMeta.label}
                </p>
              </div>
              {member.role === "owner" && (
                <span className="badge badge-primary badge-sm">Owner</span>
              )}
              {member.role === "admin" && (
                <span className="badge badge-secondary badge-sm">Admin</span>
              )}
            </div>
          )})}
        </div>
      </div>
    </div>
  );
};

export default ChannelMembersPanel;
