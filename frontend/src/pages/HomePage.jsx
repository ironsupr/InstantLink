import { useEffect } from "react";
import { Link } from "react-router";
import {
  BellIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  Clock3Icon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderOpenIcon,
  HashIcon,
  MegaphoneIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react";
import useAuthUser from "../hooks/useAuthUser";
import useDashboardSummary from "../hooks/useDashboardSummary";
import Avatar from "../components/Avatar";
import { useStreamContext } from "../context/StreamContext";
import { getPresenceMeta } from "../lib/presenceUtils";

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const getFocusText = (meetingCount) => {
  if (meetingCount > 0) {
    return `You have ${meetingCount} meeting${meetingCount > 1 ? "s" : ""} lined up today. Stay in flow.`;
  }
  return "Your current workflow is looking productive. Here's your focus for today.";
};

const fmtTime = (d) =>
  new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const fmtTimeBlock = (d) =>
  new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }).replace(" ", "\n");

const fmtRelative = (d) => {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Modified just now";
  if (mins < 60) return `Modified ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Modified ${hrs}h ago`;
  return `Modified ${Math.floor(hrs / 24)}d ago`;
};

const getFileMeta = (name = "") => {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return { label: "PDF", bg: "bg-red-500/10", text: "text-red-500" };
  if (["doc", "docx"].includes(ext)) return { label: "DOC", bg: "bg-blue-500/10", text: "text-blue-600" };
  if (["xls", "xlsx"].includes(ext)) return { label: "XLS", bg: "bg-emerald-500/10", text: "text-emerald-600" };
  if (["ppt", "pptx"].includes(ext)) return { label: "PPT", bg: "bg-orange-500/10", text: "text-orange-500" };
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
    return { label: "IMG", bg: "bg-fuchsia-500/10", text: "text-fuchsia-500" };
  }
  return { label: "FILE", bg: "bg-base-300", text: "text-base-content/60" };
};

const isMeetingNow = (meeting) => {
  const start = new Date(meeting.startTime).getTime();
  const end = start + (meeting.duration || 60) * 60_000;
  const now = Date.now();
  return now >= start && now <= end;
};

const DashboardCard = ({ title, icon: Icon, action, children, className = "" }) => (
  <section className={`rounded-3xl border border-base-300 bg-base-100 shadow-sm ${className}`}>
    <div className="flex items-center justify-between px-5 py-4 border-b border-base-300">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <h2 className="text-base font-bold text-base-content">{title}</h2>
      </div>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

const LoaderBlock = ({ height = "h-40" }) => (
  <div className={`rounded-2xl bg-base-200/80 animate-pulse ${height}`} />
);

const getNewsTone = (type) => {
  if (type === "accepted") {
    return {
      badge: "CONNECTED",
      badgeClass: "bg-emerald-500/10 text-emerald-600",
      title: "Connection Accepted",
      description: "accepted your connection request. Start the conversation.",
    };
  }

  return {
    badge: "UPDATE",
    badgeClass: "bg-primary/10 text-primary",
    title: "New Connection Request",
    description: "wants to connect with you.",
  };
};

const HomePage = () => {
  const { authUser } = useAuthUser();
  const { getUserPresence, refreshUserPresence } = useStreamContext();
  const firstName = authUser?.fullName?.split(" ")[0] ?? "there";

  const { data: dashboardData, isLoading: dashboardLoading } = useDashboardSummary();
  const showSectionLoaders = dashboardLoading && !dashboardData;

  const todayMeetings = dashboardData?.todayMeetings ?? [];
  const recentFiles = dashboardData?.recentFiles ?? [];
  const members = dashboardData?.members ?? [];
  const incomingReqs = dashboardData?.incomingReqs ?? [];
  const acceptedReqs = dashboardData?.acceptedReqs ?? [];
  const notifications = [
    ...incomingReqs.map((req) => ({ ...req, _ntype: "request" })),
    ...acceptedReqs.map((req) => ({ ...req, _ntype: "accepted" })),
  ].slice(0, 4);

  useEffect(() => {
    refreshUserPresence(members.map((member) => member._id).filter(Boolean));
  }, [members, refreshUserPresence]);

  return (
    <div className="min-h-screen bg-base-200/60 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-[32px] bg-base-100 px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary/70">Dashboard Overview</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-base-content sm:text-4xl">
                {getGreeting()}, {firstName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-base-content/60 sm:text-base">
                {getFocusText(todayMeetings.length)}
              </p>
            </div>

            <div className="flex items-center gap-3 self-start lg:self-center">
              <Link
                to="/notifications"
                className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-base-300 bg-base-100 text-base-content/60 transition hover:text-primary"
              >
                <BellIcon className="size-4" />
                {incomingReqs.length > 0 && (
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-error" />
                )}
              </Link>

              <Link
                to="/profile"
                className="flex items-center gap-3 rounded-2xl border border-base-300 bg-base-100 px-3 py-2.5 shadow-sm transition hover:border-primary/30"
              >
                <Avatar
                  src={authUser?.profilePic}
                  name={authUser?.fullName}
                  size="w-10 h-10"
                  rounded="rounded-2xl"
                />
                <div className="hidden pr-1 sm:block">
                  <p className="text-sm font-semibold leading-tight">{authUser?.fullName}</p>
                  <p className="text-xs capitalize text-base-content/45">{authUser?.role || "member"}</p>
                </div>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <DashboardCard
            title="Today's Schedule"
            icon={CalendarDaysIcon}
            className="lg:col-span-8"
            action={
              <Link to="/schedule" className="text-xs font-bold uppercase tracking-wide text-primary transition hover:opacity-80">
                View calendar
              </Link>
            }
          >
            {showSectionLoaders ? (
              <LoaderBlock height="h-56" />
            ) : todayMeetings.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-base-300 bg-base-200/40 text-center">
                <CalendarDaysIcon className="mb-3 size-8 text-base-content/25" />
                <p className="text-sm font-medium text-base-content/60">No meetings scheduled for today</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayMeetings.slice(0, 4).map((meeting) => {
                  const active = isMeetingNow(meeting);
                  const meetingPlace = meeting.channel || "Workspace room";

                  return (
                    <div
                      key={meeting._id}
                      className={`flex items-center gap-4 rounded-2xl border px-4 py-4 transition ${
                        active
                          ? "border-primary/30 bg-primary/5"
                          : "border-base-300 bg-base-100 hover:bg-base-200/40"
                      }`}
                    >
                      <div className="flex w-16 flex-shrink-0 flex-col items-center justify-center rounded-2xl bg-base-200 px-2 py-3 text-center">
                        <span className="whitespace-pre-line text-[11px] font-bold uppercase tracking-wide text-primary/70">
                          {fmtTimeBlock(meeting.startTime)}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="truncate text-sm font-bold text-base-content sm:text-[15px]">{meeting.title}</p>
                          {active && <span className="badge badge-primary badge-sm">Live</span>}
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/50">
                          <span className="inline-flex items-center gap-1">
                            <Clock3Icon className="size-3.5" /> {meeting.duration || 60}h
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <HashIcon className="size-3.5" /> {meetingPlace}
                          </span>
                        </p>
                      </div>

                      {meeting.participants?.length > 0 && (
                        <div className="hidden shrink-0 items-center -space-x-2 sm:flex">
                          {meeting.participants.slice(0, 3).map((participant, index) => (
                            <Avatar
                              key={`${meeting._id}-${index}`}
                              src={participant?.profilePic ?? participant}
                              name={participant?.fullName ?? String(participant)}
                              size="w-8 h-8"
                              rounded="rounded-full"
                              className="ring-2 ring-base-100"
                            />
                          ))}
                          {meeting.participants.length > 3 && (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-content ring-2 ring-base-100">
                              +{meeting.participants.length - 3}
                            </div>
                          )}
                        </div>
                      )}

                      {active && meeting.meetingLink ? (
                        <a
                          href={meeting.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-primary btn-sm min-h-0 h-9 rounded-xl px-4"
                        >
                          Join
                        </a>
                      ) : (
                        <div className="hidden w-16 shrink-0 sm:block" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Recent Files"
            icon={FileTextIcon}
            className="lg:col-span-4"
            action={
              <Link to="/files" className="text-xs font-bold uppercase tracking-wide text-primary transition hover:opacity-80">
                Browse
              </Link>
            }
          >
            {showSectionLoaders ? (
              <LoaderBlock height="h-56" />
            ) : recentFiles.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-base-300 bg-base-200/40 text-center">
                <FolderOpenIcon className="mb-3 size-8 text-base-content/25" />
                <p className="text-sm font-medium text-base-content/60">No recent files yet</p>
              </div>
            ) : (
              <div className="flex h-full flex-col justify-between gap-3">
                <div className="space-y-2.5">
                  {recentFiles.map((file) => {
                    const meta = getFileMeta(file.name);

                    return (
                      <div key={file._id} className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-base-200/60">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[11px] font-bold ${meta.bg} ${meta.text}`}>
                          {meta.label}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-base-content">{file.name}</p>
                          <p className="text-xs text-base-content/45">{fmtRelative(file.updatedAt)}</p>
                        </div>
                        <ExternalLinkIcon className="size-3.5 shrink-0 text-base-content/25" />
                      </div>
                    );
                  })}
                </div>

                <Link
                  to="/files"
                  className="flex items-center justify-center gap-2 rounded-2xl border border-base-300 bg-base-200/50 px-4 py-3 text-sm font-semibold text-base-content/60 transition hover:border-primary/25 hover:text-primary"
                >
                  Browse File Manager <ChevronRightIcon className="size-4" />
                </Link>
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="What's New"
            icon={MegaphoneIcon}
            className="lg:col-span-8"
            action={<button className="btn btn-ghost btn-xs btn-circle text-base-content/40">•••</button>}
          >
            {showSectionLoaders ? (
              <LoaderBlock height="h-56" />
            ) : notifications.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-base-300 bg-base-200/40 text-center">
                <BellIcon className="mb-3 size-8 text-base-content/25" />
                <p className="text-sm font-medium text-base-content/60">Nothing new right now</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {notifications.map((notification) => {
                  const user = notification._ntype === "accepted"
                    ? (notification.sender ?? notification.recipient)
                    : notification.sender;
                  const tone = getNewsTone(notification._ntype);

                  return (
                    <div key={notification._id} className="rounded-2xl bg-base-200/65 p-4 transition hover:bg-base-200">
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
                        <span className={`rounded-full px-2.5 py-1 ${tone.badgeClass}`}>{tone.badge}</span>
                        <span className="text-base-content/35">{fmtRelative(notification.updatedAt || notification.createdAt).replace("Modified ", "")}</span>
                      </div>

                      <h3 className="mt-4 text-lg font-bold text-base-content">{tone.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-base-content/60">
                        <span className="font-semibold text-base-content">{user?.fullName}</span> {tone.description}
                      </p>

                      <div className="mt-5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar
                            src={user?.profilePic}
                            name={user?.fullName}
                            size="w-8 h-8"
                            rounded="rounded-full"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-base-content">{user?.fullName}</p>
                            <p className="truncate text-[11px] text-base-content/45">
                              {notification._ntype === "accepted" ? "Contact" : "Pending response"}
                            </p>
                          </div>
                        </div>

                        <Link
                          to={notification._ntype === "accepted" ? `/chat/${user?._id}` : "/notifications"}
                          className="text-xs font-semibold text-primary transition hover:opacity-80"
                        >
                          {notification._ntype === "accepted" ? "Message" : "Review"}
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Team Status"
            icon={UsersIcon}
            className="lg:col-span-4"
            action={
              <Link to="/friends" className="text-xs font-bold uppercase tracking-wide text-primary transition hover:opacity-80">
                Directory
              </Link>
            }
          >
            {showSectionLoaders ? (
              <LoaderBlock height="h-56" />
            ) : members.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-base-300 bg-base-200/40 text-center">
                <UsersIcon className="mb-3 size-8 text-base-content/25" />
                <p className="text-sm font-medium text-base-content/60">No team members yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => {
                  const inMeeting = todayMeetings.some(
                    (meeting) =>
                      isMeetingNow(meeting) &&
                      meeting.participants?.some?.((participant) => participant?._id === member._id || participant === member._id)
                  );
                  const presenceUser = getUserPresence(member._id, member);
                  const presenceMeta = getPresenceMeta(presenceUser);

                  return (
                    <div key={member._id} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-base-200/50">
                      <div className="relative shrink-0">
                        <Avatar
                          src={presenceUser?.profilePic || member.profilePic}
                          name={presenceUser?.fullName || member.fullName}
                          size="w-11 h-11"
                          rounded="rounded-full"
                        />
                        <span
                          className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-base-100 ${
                            inMeeting ? "bg-warning" : presenceMeta.dotClassName
                          }`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-base-content">{presenceUser?.fullName || member.fullName}</p>
                        <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-base-content/35">
                          {inMeeting ? "In meeting" : presenceMeta.label}
                        </p>
                      </div>

                      <Link
                        to={`/chat/${member._id}`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-base-200 text-base-content/45 transition hover:text-primary"
                      >
                        <VideoIcon className="size-3.5" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </DashboardCard>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
