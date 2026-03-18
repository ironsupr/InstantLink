import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import Avatar from "./Avatar";
import {
  X, MessageSquare, MapPin, Globe, BookOpen,
  Briefcase, Hash, Mail,
} from "lucide-react";
import { getLanguageFlag } from "./FriendCard";

/**
 * ContactCard — floating profile modal.
 * Props:
 *   user     — the member object { _id, fullName, profilePic, role, location, bio, nativeLanguage, learningLanguage, email }
 *   onClose  — fn()
 *   selfId   — authUser._id  (hides "Message" button for own card)
 */
const ContactCard = ({ user, onClose, selfId }) => {
  const navigate = useNavigate();
  const ref = useRef(null);

  /* Close on Escape */
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  /* Close on backdrop click */
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleChat = () => {
    navigate(`/chat/${user._id}`);
    onClose();
  };

  const roleBadge = {
    owner:  { label: "Owner",  cls: "bg-amber-100 text-amber-700 border border-amber-200" },
    admin:  { label: "Admin",  cls: "bg-blue-100  text-blue-700  border border-blue-200"  },
    member: { label: "Member", cls: "bg-gray-100  text-gray-600  border border-gray-200"  },
  };
  const badge = roleBadge[user.role] ?? roleBadge.member;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div
        ref={ref}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Colourful header band ── */}
        <div className="h-24 bg-gradient-to-br from-primary/20 via-base-200 to-secondary/20 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/70 hover:bg-white text-gray-500 hover:text-gray-800 transition shadow-sm"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── Avatar (overlaps band) ── */}
        <div className="flex flex-col items-center -mt-12 px-6 pb-6">
          <div className="ring-4 ring-white rounded-2xl shadow-lg mb-3">
            <Avatar
              src={user.profilePic}
              name={user.fullName}
              size="w-20 h-20"
              rounded="rounded-2xl"
            />
          </div>

          {/* Name + role */}
          <h2 className="text-xl font-extrabold text-gray-900 text-center leading-tight">
            {user.fullName}
          </h2>
          <span className={`mt-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full capitalize ${badge.cls}`}>
            {badge.label}
          </span>

          {/* Info rows */}
          <div className="w-full mt-4 space-y-2 text-sm text-gray-600">
            {user.location && (
              <div className="flex items-center gap-2.5">
                <MapPin className="size-3.5 text-gray-400 shrink-0" />
                <span>{user.location}</span>
              </div>
            )}
            {user.email && (
              <div className="flex items-center gap-2.5">
                <Mail className="size-3.5 text-gray-400 shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
            )}
            {user.nativeLanguage && (
              <div className="flex items-center gap-2.5">
                <Globe className="size-3.5 text-gray-400 shrink-0" />
                <span className="flex items-center gap-1">
                  {getLanguageFlag(user.nativeLanguage)}
                  <span className="text-gray-500 text-xs">Speaks</span>
                  <span className="font-medium capitalize">{user.nativeLanguage}</span>
                </span>
              </div>
            )}
            {user.learningLanguage && (
              <div className="flex items-center gap-2.5">
                <BookOpen className="size-3.5 text-gray-400 shrink-0" />
                <span className="flex items-center gap-1">
                  {getLanguageFlag(user.learningLanguage)}
                  <span className="text-gray-500 text-xs">Learning</span>
                  <span className="font-medium capitalize">{user.learningLanguage}</span>
                </span>
              </div>
            )}
          </div>

          {/* Bio */}
          {user.bio && (
            <p className="mt-4 text-sm text-gray-500 text-center leading-relaxed bg-gray-50 rounded-xl px-4 py-3 w-full">
              {user.bio}
            </p>
          )}

          {/* Action buttons */}
          {user._id !== selfId && (
            <button
              onClick={handleChat}
              className="mt-5 w-full flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary/90 text-primary-content font-bold rounded-2xl shadow-sm shadow-primary/30 transition text-sm"
            >
              <MessageSquare className="size-4" />
              Send Message
            </button>
          )}
          {user._id === selfId && (
            <button
              onClick={() => { navigate("/profile"); onClose(); }}
              className="mt-5 w-full flex items-center justify-center gap-2 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-2xl transition text-sm"
            >
              Edit My Profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactCard;
