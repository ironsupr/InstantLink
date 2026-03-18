import { useState } from "react";
import { Link } from "react-router";
import { LANGUAGE_TO_FLAG } from "../constants";
import { MessageSquareIcon, UserRoundIcon } from "lucide-react";
import Avatar from "./Avatar";
import ContactCard from "./ContactCard";
import useAuthUser from "../hooks/useAuthUser";
import { useStreamContext } from "../context/StreamContext";
import { getPresenceMeta } from "../lib/presenceUtils";

const FriendCard = ({ friend }) => {
  const { authUser } = useAuthUser();
  const { getUserPresence } = useStreamContext();
  const [showCard, setShowCard] = useState(false);
  const presenceUser = getUserPresence(friend._id, friend);
  const presenceMeta = getPresenceMeta(presenceUser);

  return (
    <>
      <div className="group rounded-2xl border border-base-300/75 bg-base-100/90 shadow-[0_10px_24px_rgba(15,23,42,0.05)] hover:border-primary/45 hover:shadow-lg transition-all">
        <div className="p-5">
          <div className="flex items-start justify-between">
            {/* Clicking avatar opens contact card */}
            <button
              onClick={() => setShowCard(true)}
              className="rounded-xl transition hover:scale-105 focus:outline-none"
              title="View profile"
            >
              <Avatar
                src={presenceUser?.profilePic || friend.profilePic}
                name={presenceUser?.fullName || friend.fullName}
                size="w-12 h-12"
                rounded="rounded-xl"
                className="ring ring-primary/20 ring-offset-base-100 ring-offset-2"
              />
            </button>
            <div className={`badge badge-xs ${presenceMeta.isOnline ? "badge-success" : "badge-ghost"}`}>{presenceMeta.label}</div>
          </div>

          <div className="mt-4">
            {/* Clicking name also opens contact card */}
            <button
              onClick={() => setShowCard(true)}
              className="text-left font-bold text-lg group-hover:text-primary transition-colors w-full"
            >
              {presenceUser?.fullName || friend.fullName}
            </button>
            {(friend.location || friend.nativeLanguage) && (
              <p className="text-xs text-base-content/50 mb-4 capitalize">
                {friend.location || friend.nativeLanguage}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {friend.nativeLanguage && (
              <span className="bg-base-200/80 text-base-content px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center border border-base-300/70">
                {getLanguageFlag(friend.nativeLanguage)}
                {friend.nativeLanguage}
              </span>
            )}
            {friend.learningLanguage && (
              <span className="bg-primary/12 text-primary px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center border border-primary/20">
                {getLanguageFlag(friend.learningLanguage)}
                {friend.learningLanguage}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <Link to={`/chat/${friend._id}`} className="btn btn-primary btn-sm rounded-xl flex-1 text-white">
              <MessageSquareIcon className="size-3 mr-1" />
              Message
            </Link>
            <button
              onClick={() => setShowCard(true)}
              className="btn btn-ghost btn-sm btn-square rounded-xl border-base-300"
              title="View profile"
            >
              <UserRoundIcon className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {showCard && (
        <ContactCard
          user={presenceUser || friend}
          selfId={authUser?._id}
          onClose={() => setShowCard(false)}
        />
      )}
    </>
  );
};
export default FriendCard;

export function getLanguageFlag(language) {
  if (!language) return null;
  const langLower = language.toLowerCase();
  const countryCode = LANGUAGE_TO_FLAG[langLower];
  if (countryCode) {
    return (
      <img
        src={`https://flagcdn.com/24x18/${countryCode}.png`}
        alt={`${langLower} flag`}
        className="h-3 mr-1 inline-block"
      />
    );
  }
  return null;
}
