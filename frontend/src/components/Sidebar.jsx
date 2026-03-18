import { Link, useLocation } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import useLogout from "../hooks/useLogout";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { getMyOrganization, getUserFriends } from "../lib/api";
import { useStreamContext } from "../context/StreamContext";
import { getPresenceMeta } from "../lib/presenceUtils";
import {
  BellIcon,
  BellOffIcon,
  FileTextIcon,
  HashIcon,
  LayoutDashboardIcon,
  LockIcon,
  LogOutIcon,
  PinIcon,
  PlusIcon,
  ShipWheelIcon,
  VideoIcon,
  UsersIcon,
} from "lucide-react";
import Avatar from "./Avatar";
import ContactCard from "./ContactCard";

/* ── tiny helpers ── */
const SectionLabel = ({ label, action, compact = false }) => (
  <div className={`flex items-center justify-between px-3 ${compact ? "pt-2 pb-1.5" : "pt-3 pb-2"}`}>
    <span className={`font-semibold uppercase tracking-[0.18em] text-base-content/50 select-none ${compact ? "text-[9px]" : "text-[10px]"}`}>
      {label}
    </span>
    {action}
  </div>
);

const ChannelItem = ({ to, name, isPrivate, currentPath, unread = 0 }) => {
  const active = currentPath === to || currentPath.startsWith(to + "/");
  return (
    <Link
      to={to}
      className={`mac-sidebar-item group flex items-center gap-2.5 mx-2 px-3 py-2 rounded-xl text-sm border transition-all duration-200 ${active
          ? "border-primary/25 bg-primary/12 text-primary font-semibold shadow-sm"
          : "border-transparent text-base-content/70 hover:border-base-300/70 hover:bg-base-200/75 hover:text-base-content"
        }`}
    >
      {isPrivate
        ? <LockIcon className={`size-3.5 flex-shrink-0 ${active ? "opacity-80" : "text-base-content/35 group-hover:text-base-content/55"}`} />
        : <HashIcon className={`size-3.5 flex-shrink-0 ${active ? "opacity-80" : "text-base-content/35 group-hover:text-base-content/55"}`} />
      }
      <span className="truncate flex-1">{name}</span>
      {unread > 0 && (
        <span className="flex-shrink-0 min-w-[18px] h-[18px] bg-primary text-primary-content rounded-full text-[10px] font-bold flex items-center justify-center px-1 leading-none">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
};

/* ── Context menu (portal) ── */
const DmContextMenu = ({ x, y, pinned, muted, onPin, onToggleMute, onClose }) => {
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", top: y, left: x, zIndex: 9999 }}
      className="min-w-48 rounded-2xl border border-base-300 bg-base-100/95 p-1.5 text-sm shadow-2xl backdrop-blur"
    >
      <button
        onClick={onPin}
        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-base-200 transition-colors text-left"
      >
        <PinIcon className="size-3.5 text-base-content/50" />
        {pinned ? "Unpin Chat" : "Pin to Top"}
      </button>
      <button
        onClick={onToggleMute}
        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-base-200 transition-colors text-left"
      >
        {muted
          ? <><BellIcon className="size-3.5 text-success" /> Unmute Notifications</>
          : <><BellOffIcon className="size-3.5 text-base-content/50" /> Mute Notifications</>}
      </button>
    </div>,
    document.body
  );
};

const DmItem = ({ to, user, currentPath, onAvatarClick, unread, lastMsg, pinned, muted, onTogglePin, onToggleMute, presenceMeta }) => {
  const active = currentPath === to || currentPath.startsWith(to + "/");
  const [menu, setMenu] = useState(null); // { x, y } or null

  const handleContextMenu = (e) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        className={`mac-sidebar-item group mx-2 flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-all duration-200 ${active
            ? "border-primary/25 bg-primary/12 text-primary shadow-sm"
            : "border-transparent text-base-content/72 hover:border-base-300/70 hover:bg-base-200/75 hover:text-base-content"
          }`}
      >
        {/* Avatar — opens contact card */}
        <button
          onClick={(e) => { e.preventDefault(); onAvatarClick(user); }}
          className="relative flex-shrink-0 focus:outline-none group/av"
          title="View profile"
        >
          <Avatar
            src={user.profilePic}
            name={user.fullName}
            size="w-9 h-9"
            rounded="rounded-full"
            className="group-hover/av:ring-2 group-hover/av:ring-primary transition"
          />
          <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-base-100 ${presenceMeta?.dotClassName || "bg-error"}`} />
        </button>

        {/* Name + meta — navigates to DM */}
        <Link to={to} className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate flex-1 font-medium">{user.fullName}</span>
            {pinned && (
              <PinIcon className={`size-3 flex-shrink-0 ${active ? "opacity-60" : "text-base-content/30"}`} />
            )}
            {muted && (
              <BellOffIcon className={`size-3 flex-shrink-0 ${active ? "opacity-60" : "text-base-content/30"}`} />
            )}
            {unread > 0 && (
              <span className="flex-shrink-0 min-w-[18px] h-[18px] bg-primary text-primary-content rounded-full text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </div>
          {lastMsg && (
            <p className={`mt-0.5 truncate text-[11px] ${active ? "text-primary/70" : "text-base-content/45"
              } ${unread > 0 ? "font-semibold" : ""}`}>
              {lastMsg}
            </p>
          )}
        </Link>

        {/* Hover pin button */}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(); }}
          title={pinned ? "Unpin" : "Pin to top"}
          className={`flex-shrink-0 rounded-lg p-1 transition-all ${pinned
              ? `${active ? "opacity-60" : "opacity-40 text-primary"}`
              : "opacity-0 group-hover:opacity-40 hover:!opacity-80"
            } hover:bg-base-content/10`}
        >
          <PinIcon className="size-3" />
        </button>
      </div>

      {menu && (
        <DmContextMenu
          x={menu.x}
          y={menu.y}
          pinned={pinned}
          muted={muted}
          onPin={() => { onTogglePin(); setMenu(null); }}
          onToggleMute={() => { onToggleMute(); setMenu(null); }}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
};

const AppItem = ({ to, icon: Icon, label, currentPath, compact = false }) => {
  const active = currentPath === to || currentPath.startsWith(to + "/");
  return (
    <Link
      to={to}
      className={`mac-sidebar-item group flex items-center ${compact ? "gap-2.5 px-2.5 py-1.5 text-[13px]" : "gap-3 px-3 py-2 text-sm"} mx-2 rounded-xl border transition-all duration-200 ${active
          ? "border-primary/25 bg-primary/12 text-primary font-semibold shadow-sm"
          : "border-transparent text-base-content/70 hover:border-base-300/70 hover:bg-base-200/75 hover:text-base-content"
        }`}
    >
      <div className={`flex ${compact ? "h-7 w-7" : "h-8 w-8"} flex-shrink-0 items-center justify-center rounded-xl ${active ? "bg-primary text-primary-content" : "bg-base-200 text-base-content/45 group-hover:text-base-content/60"
        }`}>
        <Icon className={compact ? "size-3.5" : "size-4"} />
      </div>
      <span className="truncate">{label}</span>
    </Link>
  );
};

/* ════════════════════════════════════════════ */
const Sidebar = () => {
  const { authUser } = useAuthUser();
  const { logoutMutation } = useLogout();
  const { pathname } = useLocation();
  const [contactCardUser, setContactCardUser] = useState(null);

  /* Stream DM metadata */
  const { dmMeta, channelMeta, notifPermission, requestNotifPermission, isMessageMuted, toggleNotificationMute, getUserPresence } = useStreamContext();

  /* Pinned DM user IDs — persisted in localStorage */
  const [pinnedIds, setPinnedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem("collab_pinned_dms") || "[]"); }
    catch { return []; }
  });

  const togglePin = (userId) => {
    setPinnedIds((prev) => {
      const next = prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [userId, ...prev];
      localStorage.setItem("collab_pinned_dms", JSON.stringify(next));
      return next;
    });
  };

  const { data: orgData } = useQuery({
    queryKey: ["myOrganization"],
    queryFn: getMyOrganization,
    enabled: !!authUser,
    staleTime: 5 * 60 * 1000,
  });

  const { data: friends = [] } = useQuery({
    queryKey: ["friends"],
    queryFn: getUserFriends,
    enabled: !!authUser,
    staleTime: 60_000,
  });

  const org = orgData?.organization;
  const channels = org?.channels || [];
  const isAdmin = ["admin", "owner"].includes(authUser?.role);

  /* Build unified DM contacts list: friends + non-friend message partners */
  const friendIds = new Set(friends.map(f => f._id));

  /* Create virtual user objects for non-friend DM partners */
  const nonFriendDmPartners = Object.entries(dmMeta)
    .filter(([partnerId]) => !friendIds.has(partnerId))
    .map(([partnerId, meta]) => ({
      _id: partnerId,
      fullName: meta.partnerName || "Unknown",
      profilePic: meta.partnerImage || "",
      _isFromStream: true, // Flag to identify virtual users
    }));

  /* Combine friends with non-friend DM partners */
  const allDmContacts = [...friends, ...nonFriendDmPartners];

  /* Sort: pinned first, then by lastMsgAt desc (most recent at top) */
  const sortedContacts = [...allDmContacts].sort((a, b) => {
    const aPinned = pinnedIds.includes(a._id);
    const bPinned = pinnedIds.includes(b._id);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    const aTime = dmMeta[a._id]?.lastMsgAt ? new Date(dmMeta[a._id].lastMsgAt).getTime() : 0;
    const bTime = dmMeta[b._id]?.lastMsgAt ? new Date(dmMeta[b._id].lastMsgAt).getTime() : 0;
    return bTime - aTime;
  });

  /* Total unread across all DMs */
  const totalUnread = Object.values(dmMeta).reduce((sum, m) => sum + (m.unread || 0), 0);

  return (
    <aside className="mac-sidebar relative hidden h-[calc(100vh-20px)] w-[268px] shrink-0 overflow-hidden lg:sticky lg:top-[10px] lg:flex lg:flex-col">

      <div className="pointer-events-none absolute -right-10 top-0 h-36 w-36 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-8 bottom-16 h-32 w-32 rounded-full bg-sky-400/10 blur-3xl" />

      {/* ── WORKSPACE HEADER ──────────────────── */}
      <div className="relative z-10 flex flex-shrink-0 flex-col gap-3 border-b border-base-300/70 bg-base-100/55 px-4 pb-4 pt-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
        {/* app icon */}
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary overflow-hidden border border-primary/20 shadow-[0_8px_20px_rgba(79,70,229,0.12)]">
            {org?.logo ? (
              <img src={org.logo} alt={org?.name || "Organization logo"} className="h-full w-full object-cover" />
            ) : (
              <ShipWheelIcon className="size-4" />
            )}
          </div>
          {isAdmin ? (
            <Link
              to="/admin"
              className="min-w-0 flex-1 rounded-xl px-1 py-1 -mx-1 -my-1 transition-colors duration-200 hover:bg-base-200/70"
              title="Open workspace admin"
            >
              <div className="flex items-center gap-2">
                <p className="truncate text-[15px] font-semibold leading-tight text-base-content">
                  {org?.name || "Collab"}
                </p>
                <div className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-primary border border-primary/20">
                  Workspace
                </div>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-base-content/45">
                {org?.slug && <span className="truncate">@{org.slug}</span>}
                <span className="inline-flex h-1 w-1 rounded-full bg-base-content/20" />
                <span>{channels.length} channels</span>
              </div>
            </Link>
          ) : (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[15px] font-semibold leading-tight text-base-content">
                  {org?.name || "Collab"}
                </p>
                <div className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-primary border border-primary/20">
                  Workspace
                </div>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-base-content/45">
                {org?.slug && <span className="truncate">@{org.slug}</span>}
                <span className="inline-flex h-1 w-1 rounded-full bg-base-content/20" />
                <span>{channels.length} channels</span>
              </div>
            </div>
          )}
          <button
            onClick={() => logoutMutation()}
            title="Sign out"
            className="mac-sidebar-icon-button flex-shrink-0"
          >
            <LogOutIcon className="size-3.5" />
          </button>
        </div>

      </div>

      {/* ── SCROLLABLE BODY ───────────────────── */}
      <div className="relative z-10 flex-1 overflow-y-auto px-2 pb-4 pt-3">

        {/* DASHBOARD */}
        <div className="mac-sidebar-section">
          <AppItem to="/" icon={LayoutDashboardIcon} label="Dashboard" currentPath={pathname} />
        </div>

        {/* CHANNELS */}
        <section className="mac-sidebar-section">
          <SectionLabel
            label="Channels"
            action={
              isAdmin && (
                <Link
                  to="/admin"
                  title="Add channel"
                  className="mac-sidebar-icon-button"
                >
                  <PlusIcon className="size-3.5" />
                </Link>
              )
            }
          />
          {channels.length > 0 ? (
            <div className="space-y-1">
              {channels.map((ch) => {
                const chPath = `/chat/${org?.slug ? `org-${org.slug}-${ch.name}` : ch.name}`;
                return (
                  <ChannelItem
                    key={ch._id || ch.name}
                    to={chPath}
                    name={ch.name}
                    isPrivate={ch.isPrivate}
                    currentPath={pathname}
                                      unread={channelMeta[org?.slug ? `org-${org.slug}-${ch.name}` : ch.name]?.unread || 0}
                  />
                );
              })}
            </div>
          ) : (
            <p className="px-5 py-1 text-xs italic text-base-content/30">No channels</p>
          )}
        </section>

        {/* DIRECT MESSAGES */}
        <section className="mac-sidebar-section">
          <SectionLabel
            label="Direct Messages"
            action={
              <div className="flex items-center gap-1.5">
                {totalUnread > 0 && (
                  <span className="min-w-[18px] h-[18px] bg-primary text-primary-content rounded-full text-[10px] font-bold flex items-center justify-center px-1 leading-none animate-pulse">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                )}
                {notifPermission !== "unsupported" && (
                  notifPermission === "granted" ? (
                    <button
                      title="Browser notifications enabled — click for info"
                      className="mac-sidebar-icon-button text-success"
                      onClick={() =>
                        toast.success(
                          "Browser notifications are on. To disable, click the lock icon in your browser's address bar.",
                          { duration: 5000 }
                        )
                      }
                    >
                      <BellIcon className="size-3.5" />
                    </button>
                  ) : notifPermission === "denied" ? (
                    <button
                      title="Notifications blocked — click for help"
                      className="mac-sidebar-icon-button text-error"
                      onClick={async () => {
                        const result = await requestNotifPermission();
                        if (result !== "granted") {
                          toast(
                            "Notifications are blocked. Click the 🔒 lock icon in your browser's address bar and set Notifications to 'Allow'.",
                            { duration: 7000, icon: "🔔" }
                          );
                        }
                      }}
                    >
                      <BellOffIcon className="size-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={requestNotifPermission}
                      title="Enable browser notifications"
                      className="mac-sidebar-icon-button"
                    >
                      <BellIcon className="size-3.5" />
                    </button>
                  )
                )}
                <Link
                  to="/friends"
                  title="Browse team"
                  className="mac-sidebar-icon-button"
                >
                  <PlusIcon className="size-3.5" />
                </Link>
              </div>
            }
          />
          {sortedContacts.length > 0 ? (
            <div className="space-y-1">
              {sortedContacts.slice(0, 8).map((contact) => {
                const dmChannelId = authUser
                  ? [authUser._id, contact._id].sort().join("-")
                  : null;
                const isMuted = dmChannelId ? isMessageMuted(dmChannelId) : false;

                return (
                  <DmItem
                    key={contact._id}
                    to={`/chat/${contact._id}`}
                    user={contact}
                    currentPath={pathname}
                    onAvatarClick={setContactCardUser}
                    unread={dmMeta[contact._id]?.unread || 0}
                    lastMsg={dmMeta[contact._id]?.lastMsg || ""}
                    pinned={pinnedIds.includes(contact._id)}
                    muted={isMuted}
                    presenceMeta={getPresenceMeta(getUserPresence(contact._id, contact))}
                    onTogglePin={() => togglePin(contact._id)}
                    onToggleMute={() => {
                      if (!dmChannelId) return;
                      toggleNotificationMute(dmChannelId, "messages");
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <p className="px-5 py-1 text-xs italic text-base-content/30">No contacts yet</p>
          )}
          {sortedContacts.length > 8 && (
            <Link
              to="/friends"
              className="mx-2 mt-1 flex items-center rounded-xl px-3 py-2 text-xs font-medium text-base-content/45 transition-colors duration-200 hover:bg-base-200/75 hover:text-primary"
            >
              +{sortedContacts.length - 8} more conversations
            </Link>
          )}
        </section>
      </div>

      {/* ── PINNED APPS ─────────────────────── */}
      <div className="relative z-10 flex-shrink-0 border-t border-base-300/70 bg-base-100/55 px-2 pb-2.5 pt-2.5 backdrop-blur-xl">
        <section className="mac-sidebar-section mb-0">
          <SectionLabel label="Apps" compact />
          <AppItem to="/files" icon={FileTextIcon} label="Files" currentPath={pathname} compact />
          <AppItem to="/friends" icon={UsersIcon} label="Team & Friends" currentPath={pathname} compact />
          <AppItem to="/schedule" icon={VideoIcon} label="Meetings" currentPath={pathname} compact />
          <AppItem to="/records" icon={FileTextIcon} label="Meeting Records" currentPath={pathname} compact />
        </section>
      </div>

      {/* Contact card modal */}
      {contactCardUser && (
        <ContactCard
          user={contactCardUser}
          selfId={authUser?._id}
          onClose={() => setContactCardUser(null)}
        />
      )}
    </aside>
  );
};

export default Sidebar;
