import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMeetings, createMeeting, deleteMeeting, getMyOrganization, getOrgMembers } from "../lib/api";
import {
  Plus, ChevronLeft, ChevronRight, Loader2, X,
  Calendar, CalendarDays, LayoutGrid, Clock, Hash, Users, Zap,
  Video, MapPin, Trash2, AlertCircle, Search, UserPlus, Check,
} from "lucide-react";
import toast from "react-hot-toast";
import useAuthUser from "../hooks/useAuthUser";
import Avatar from "../components/Avatar";

/* ═══════════════════════════════════════════════════════════
   CONSTANTS & DATE UTILS
═══════════════════════════════════════════════════════════ */
const PALETTES = [
  { bg: "#dbeafe", border: "#3b82f6", text: "#1d4ed8", solid: "#3b82f6" },
  { bg: "#d1fae5", border: "#10b981", text: "#065f46", solid: "#10b981" },
  { bg: "#fef9c3", border: "#ca8a04", text: "#854d0e", solid: "#ca8a04" },
  { bg: "#ede9fe", border: "#7c3aed", text: "#4c1d95", solid: "#7c3aed" },
  { bg: "#fee2e2", border: "#dc2626", text: "#991b1b", solid: "#dc2626" },
  { bg: "#fce7f3", border: "#db2777", text: "#831843", solid: "#db2777" },
];
const palette = (id = "x") => {
  const h = [...(id || "x")].reduce((a, c) => a + c.charCodeAt(0), 0);
  return PALETTES[h % PALETTES.length];
};

const HOUR_START  = 0;
const HOUR_END    = 24;
const HOURS       = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const PX_PER_HR   = 56;
const PX_PER_MIN  = PX_PER_HR / 60;
const SNAP_MIN    = 15; // snaps to 15-minute intervals on click

const addDays    = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = (d)    => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const isSameDay  = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const isToday    = (d)    => isSameDay(d, new Date());

const getWeekStart = (date) => {
  const d = new Date(date);
  const dow = d.getDay();        // 0=Sun
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return startOfDay(d);
};

const getMonthGrid = (date) => {
  const y = date.getFullYear(), m = date.getMonth();
  const first = new Date(y, m, 1);
  const startPad = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const days = [];
  for (let i = -startPad; i < new Date(y, m + 1, 0).getDate(); i++)
    days.push(new Date(y, m, 1 + i));
  while (days.length % 7 !== 0)
    days.push(new Date(days.at(-1).getTime() + 86_400_000));
  return days;
};

const fmtHour   = (h) => h === 0 ? "" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
const fmtTime   = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDateHR = (d) => new Date(d).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
const pad2      = (n) => String(n).padStart(2, "0");

const toDTLocal = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
};

const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
const DAY_SHORT   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAY_MINI    = ["Mo","Tu","We","Th","Fr","Sa","Su"];

const DURATIONS = [
  {v:15,l:"15 min"},{v:30,l:"30 min"},{v:45,l:"45 min"},
  {v:60,l:"1 hour"},{v:90,l:"90 min"},{v:120,l:"2 hours"},
  {v:180,l:"3 hours"},{v:240,l:"4 hours"},
];

/* ═══════════════════════════════════════════════════════════
   OVERLAP LAYOUT  (Google-style column partitioning)
═══════════════════════════════════════════════════════════ */
const layoutBlocks = (meetings) => {
  if (!meetings.length) return [];
  const sorted = [...meetings].sort((a,b) => new Date(a.startTime) - new Date(b.startTime));
  const cols = [];   // each col holds last-end time
  const placed = sorted.map(m => {
    const start = new Date(m.startTime).getTime();
    const end   = start + m.duration * 60_000;
    let col = cols.findIndex(e => e <= start);
    if (col === -1) { col = cols.length; cols.push(0); }
    cols[col] = end;
    return { m, col };
  });
  const totalCols = cols.length;
  return placed.map(({ m, col }) => ({
    meeting: m,
    left:    col / totalCols,
    width:   1  / totalCols,
  }));
};

/* ═══════════════════════════════════════════════════════════
   EVENT DETAIL POPOVER
═══════════════════════════════════════════════════════════ */
const EventPopover = ({ meeting, anchorRect, isAdmin, onDelete, onClose }) => {
  const ref    = useRef(null);
  const navigate = useNavigate();
  const p      = palette(meeting._id);
  const start  = new Date(meeting.startTime);
  const end    = new Date(start.getTime() + meeting.duration * 60_000);

  // Close on outside click
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  // Position: try to show to the right of the block, fall back to left
  const style = useMemo(() => {
    if (!anchorRect) return { top: 60, left: 60 };
    const W = 280, H = 220;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = anchorRect.right + 8;
    let top  = anchorRect.top;
    if (left + W > vw - 12) left = anchorRect.left - W - 8;
    if (top  + H > vh - 12) top  = vh - H - 12;
    if (left < 12) left = 12;
    if (top  < 12) top  = 12;
    return { top, left, width: W };
  }, [anchorRect]);

  const handleJoin = () => {
    onClose();
    // Use the meeting ID as the call ID.
    // CallPage expects an ID in the URL.
    navigate(`/call/${meeting._id}`, {
      state: {
        isInitiator: true, // or check if host
        participantIds: meeting.participants?.map(p => p._id) || [],
        participantNames: meeting.participants?.map(p => p.fullName) || [],
        participantProfiles: meeting.participants?.map(p => ({ id: p._id, name: p.fullName, image: p.profilePic })) || [],
        callType: "video",
      }
    });
  };

  return (
    <div
      ref={ref}
      className="fixed z-[100] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
      style={style}
      onClick={e => e.stopPropagation()}
    >
      {/* color strip */}
      <div className="h-2" style={{ backgroundColor: p.solid }} />
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-bold text-gray-900 text-sm leading-tight flex-1">{meeting.title}</h3>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-100 text-gray-400 transition shrink-0">
            <X className="size-3.5" />
          </button>
        </div>
        <div className="space-y-2 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-gray-400 shrink-0" />
            <span>{fmtDateHR(start)}</span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="size-3.5 text-gray-400 shrink-0" />
            <span>{fmtTime(start)} – {fmtTime(end)} ({meeting.duration} min)</span>
          </div>
          <div className="flex items-center gap-2">
            <Hash className="size-3.5 text-gray-400 shrink-0" />
            <span>{meeting.channel}</span>
          </div>
          {meeting.participants?.length > 0 && (
            <div className="flex items-center gap-2">
              <Users className="size-3.5 text-gray-400 shrink-0" />
              <div className="flex items-center gap-1.5">
                <div className="flex -space-x-1.5">
                  {meeting.participants.slice(0,4).map(p => (
                    <Avatar key={p._id} src={p.profilePic} name={p.fullName} size="w-5 h-5" />
                  ))}
                </div>
                <span className="text-gray-500">{meeting.participants.length} attendee{meeting.participants.length !== 1 ? "s" : ""}</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
          <button
            onClick={handleJoin}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition"
          >
            <Video className="size-3.5" /> Join
          </button>
          {isAdmin && (
            <button
              onClick={() => { onDelete(meeting._id); onClose(); }}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 text-xs transition"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   MEETING BLOCK  (positioned absolutely inside time grid col)
═══════════════════════════════════════════════════════════ */
const MeetingBlock = ({ meeting, left, width, onClickBlock, pixelsPerMin }) => {
  const start  = new Date(meeting.startTime);
  const topPx  = ((start.getHours() - HOUR_START) * 60 + start.getMinutes()) * pixelsPerMin;
  const height = Math.max(18, meeting.duration * pixelsPerMin - 2);
  const p      = palette(meeting._id);
  const small  = height < 36;
  const ref    = useRef(null);

  const handleClick = (e) => {
    e.stopPropagation();
    const rect = ref.current?.getBoundingClientRect();
    onClickBlock(meeting, rect ?? null);
  };

  return (
    <div
      ref={ref}
      onClick={handleClick}
      className="absolute rounded-lg border-l-[3px] px-1.5 py-0.5 cursor-pointer group transition-all hover:brightness-95 hover:shadow-md select-none overflow-hidden"
      style={{
        top:    `${topPx}px`,
        height: `${height}px`,
        left:   `calc(${left * 100}% + 2px)`,
        width:  `calc(${width * 100}% - 4px)`,
        backgroundColor: p.bg,
        borderLeftColor: p.solid,
        zIndex: 4,
      }}
    >
      <p className="font-semibold leading-tight truncate text-[11px]" style={{ color: p.text }}>
        {meeting.title}
      </p>
      {!small && (
        <p className="text-[10px] truncate opacity-70" style={{ color: p.text }}>
          {fmtTime(meeting.startTime)}
        </p>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   MINI CALENDAR (left sidebar)
═══════════════════════════════════════════════════════════ */
const MiniCalendar = ({ selected, onChange, meetingDates }) => {
  const [month, setMonth] = useState(() => {
    const d = new Date(selected); d.setDate(1); return d;
  });
  const grid = useMemo(() => getMonthGrid(month), [month]);
  const dots = useMemo(() => new Set(meetingDates.map(d => startOfDay(d).getTime())), [meetingDates]);

  return (
    <div className="px-3 pb-3 select-none">
      {/* month nav */}
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth()-1, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 transition"
        ><ChevronLeft className="size-3.5" /></button>
        <span className="text-xs font-bold text-gray-700">
          {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </span>
        <button
          onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth()+1, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 transition"
        ><ChevronRight className="size-3.5" /></button>
      </div>
      {/* day headers */}
      <div className="grid grid-cols-7 mb-0.5">
        {DAY_MINI.map(d => (
          <div key={d} className="text-center text-[9px] font-bold text-gray-400 py-0.5">{d}</div>
        ))}
      </div>
      {/* day cells */}
      <div className="grid grid-cols-7">
        {grid.map((day, i) => {
          const inMonth = day.getMonth() === month.getMonth();
          const isSel   = isSameDay(day, selected);
          const isTod   = isToday(day);
          const hasDot  = dots.has(startOfDay(day).getTime());
          return (
            <button
              key={i}
              onClick={() => { onChange(day); /* also sync mini-cal month */ setMonth(new Date(day.getFullYear(), day.getMonth(), 1)); }}
              className={`relative flex items-center justify-center rounded-full text-[11px] font-medium transition mx-auto my-0.5 w-6 h-6 ${
                isSel  ? "bg-blue-600 text-white"
                : isTod ? "border border-blue-400 text-blue-600"
                : inMonth ? "text-gray-700 hover:bg-gray-100"
                : "text-gray-300 hover:bg-gray-50"
              }`}
            >
              {day.getDate()}
              {hasDot && !isSel && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   TIME GRID COLUMN  (shared by week + day views)
═══════════════════════════════════════════════════════════ */
const TimeGridColumn = ({ day, layoutedMeetings, onClickSlot, onClickBlock, isCurrentDay }) => {
  const totalH = (HOUR_END - HOUR_START) * PX_PER_HR;

  const handleColClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y    = e.clientY - rect.top;
    const mins = Math.round(y / PX_PER_MIN / SNAP_MIN) * SNAP_MIN;
    const h    = HOUR_START + Math.floor(mins / 60);
    const m    = mins % 60;
    onClickSlot(day, h, m);
  };

  return (
    <div
      className={`flex-1 relative border-l border-gray-200 cursor-pointer group/col ${isCurrentDay ? "bg-blue-50/20" : ""}`}
      style={{ minHeight: `${totalH}px` }}
      onClick={handleColClick}
    >
      {/* Hour + half-hour lines */}
      {HOURS.map(h => (
        <div key={h} style={{ top: `${(h - HOUR_START) * PX_PER_HR}px`, position: "absolute", left:0, right:0 }}>
          <div className="border-t border-gray-200" />
          {/* half-hour dashed line */}
          <div
            className="border-t border-dashed border-gray-100"
            style={{ position: "absolute", top: `${PX_PER_HR/2}px`, left:0, right:0 }}
          />
        </div>
      ))}

      {/* Hover "create" hint */}
      <div className="absolute inset-0 pointer-events-none group-hover/col:bg-blue-50/10 transition" />

      {/* Current time line */}
      {isCurrentDay && (() => {
        const now   = new Date();
        const topPx = ((now.getHours() - HOUR_START) * 60 + now.getMinutes()) * PX_PER_MIN;
        if (topPx < 0 || topPx > totalH) return null;
        return (
          <div className="absolute left-0 right-0 z-30 flex items-center pointer-events-none" style={{ top: `${topPx}px` }}>
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 -ml-1.5 shrink-0 shadow" />
            <div className="flex-1 border-t-2 border-blue-500" />
          </div>
        );
      })()}

      {/* Meeting blocks */}
      {layoutedMeetings.map(({ meeting, left, width }) => (
        <MeetingBlock
          key={meeting._id}
          meeting={meeting}
          left={left}
          width={width}
          onClickBlock={onClickBlock}
          pixelsPerMin={PX_PER_MIN}
        />
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
const SchedulePage = () => {
  const queryClient = useQueryClient();
  const { authUser }  = useAuthUser();
  const navigate = useNavigate();
  const isAdmin       = ["admin", "owner"].includes(authUser?.role);

  const [viewMode,     setViewMode]    = useState("week");
  const [currentDate,  setCurrentDate] = useState(new Date());
  const [showModal,    setShowModal]   = useState(false);
  const [modalDefaults,setModalDefaults] = useState(null);
  const [activeEvent,  setActiveEvent] = useState(null);   // { meeting, anchorRect }

  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate]);
  const weekDays  = useMemo(() => Array.from({length:7}, (_,i) => addDays(weekStart,i)), [weekStart]);

  /* ── fetch range ── */
  const fetchFrom = useMemo(() => {
    if (viewMode === "month")
      return new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
    if (viewMode === "week")  return weekStart.toISOString();
    return startOfDay(currentDate).toISOString();
  }, [viewMode, currentDate, weekStart]);

  const fetchTo = useMemo(() => {
    if (viewMode === "month")
      return new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 1).toISOString();
    if (viewMode === "week")  return addDays(weekStart,7).toISOString();
    return addDays(startOfDay(currentDate),1).toISOString();
  }, [viewMode, currentDate, weekStart]);

  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ["meetings", fetchFrom, fetchTo],
    queryFn:  () => getMeetings({ from: fetchFrom, to: fetchTo }),
  });

  /* upcoming always = future events */
  const { data: upcoming = [] } = useQuery({
    queryKey: ["meetings","upcoming"],
    queryFn:  () => getMeetings({ from: new Date().toISOString() }),
  });

  const { data: org } = useQuery({ queryKey:["org"], queryFn: getMyOrganization });
  const channels = org?.channels ?? [];

  const { mutate: schedule, isPending: isCreating } = useMutation({
    mutationFn: createMeeting,
    onSuccess: () => {
      toast.success("Meeting scheduled! Emails will be sent at the scheduled time.");
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Failed to schedule"),
  });

  const { mutate: cancel } = useMutation({
    mutationFn: deleteMeeting,
    onSuccess: () => {
      toast.success("Meeting cancelled");
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });

  /* ── navigation ── */
  const go = (dir) => {
    if (viewMode === "week")  setCurrentDate(d => addDays(d, dir*7));
    else if (viewMode === "month") setCurrentDate(d => new Date(d.getFullYear(), d.getMonth()+dir, 1));
    else setCurrentDate(d => addDays(d, dir));
  };

  const goToDay = (day) => { setCurrentDate(day); setViewMode("day"); };

  /* ── header label ── */
  const headerLabel = useMemo(() => {
    if (viewMode === "month")
      return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (viewMode === "week") {
      const end = addDays(weekStart,6);
      const s = weekStart.toLocaleDateString([],{month:"long", day:"numeric"});
      const e = end.toLocaleDateString([],{
        month: weekStart.getMonth()===end.getMonth() ? undefined : "long",
        day:"numeric", year:"numeric",
      });
      return `${s} – ${e}`;
    }
    return currentDate.toLocaleDateString([],{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  }, [viewMode, currentDate, weekStart]);

  /* ── grouped meetings ── */
  const meetingsByDay = useMemo(() => {
    const map = {};
    meetings.forEach(m => {
      const k = startOfDay(new Date(m.startTime)).getTime();
      if (!map[k]) map[k] = [];
      map[k].push(m);
    });
    return map;
  }, [meetings]);

  const layoutForDay = useCallback((day) => {
    const k = startOfDay(day).getTime();
    return layoutBlocks(meetingsByDay[k] ?? []);
  }, [meetingsByDay]);

  /* ── month grid ── */
  const monthGrid    = useMemo(() => getMonthGrid(currentDate), [currentDate]);

  /* ── all meeting dates (for mini-cal dots) ── */
  const allMeetingDates = useMemo(() => upcoming.map(m => new Date(m.startTime)), [upcoming]);

  /* ── grid scroll ── */
  const gridScrollRef = useRef(null);
  useEffect(() => {
    if (!gridScrollRef.current) return;
    const scrollTop = (8 - HOUR_START) * PX_PER_HR;
    gridScrollRef.current.scrollTop = scrollTop;
  }, [viewMode, weekStart, currentDate]);

  /* ── slot click → open modal ── */
  const handleClickSlot = useCallback((day, hour, minute) => {
    const dt = new Date(day);
    dt.setHours(hour, minute, 0, 0);
    setModalDefaults({ startTime: toDTLocal(dt) });
    setShowModal(true);
    setActiveEvent(null);
  }, []);

  /* ── event click → popover ── */
  const handleClickBlock = useCallback((meeting, anchorRect) => {
    setActiveEvent({ meeting, anchorRect });
  }, []);

  const handleStartInstantHuddle = useCallback(() => {
    const safeOrg = (authUser?.organization || "workspace").toString().slice(-6);
    const huddleId = `huddle-${safeOrg}-${Date.now()}`;
    navigate(`/call/${huddleId}`);
  }, [authUser?.organization, navigate]);

  /* close popover on scroll */
  useEffect(() => {
    const handler = () => setActiveEvent(null);
    window.addEventListener("scroll", handler, true);
    return () => window.removeEventListener("scroll", handler, true);
  }, []);

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <div className="flex h-full bg-white overflow-hidden" onClick={() => setActiveEvent(null)}>

      {/* ═════════════════════════════
          LEFT SIDEBAR
      ═════════════════════════════ */}
      <aside className="w-56 shrink-0 border-r border-gray-200 flex flex-col bg-white overflow-y-auto">

        {/* New Meeting */}
        <div className="p-3 pb-2">
          <button
            onClick={() => { setModalDefaults(null); setShowModal(true); setActiveEvent(null); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm shadow-blue-500/25 transition"
          >
            <Plus className="size-4" /> New Meeting
          </button>
        </div>

        {/* Mini calendar */}
        <MiniCalendar
          selected={currentDate}
          onChange={(day) => { setCurrentDate(day); if (viewMode === "month") setViewMode("day"); }}
          meetingDates={allMeetingDates}
        />

        <div className="border-t border-gray-100 mx-3 mb-2" />

        {/* Calendar views nav */}
        <div className="px-3 mb-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 px-2">Calendars</p>
          {[
            { id:"my",   Icon: Calendar,     label:"My Schedule"    },
            { id:"team", Icon: Users,        label:"Team Calendars" },
            { id:"rooms",Icon: CalendarDays, label:"Meeting Rooms"  },
          ].map(({id,Icon,label}) => (
            <button
              key={id}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition"
            >
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: id==="my"?"#3b82f6":id==="team"?"#10b981":"#8b5cf6" }} />
              {label}
            </button>
          ))}
        </div>

        <div className="border-t border-gray-100 mx-3 mb-2" />

        {/* Upcoming */}
        <div className="px-3 flex-1 overflow-y-auto">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-2">Upcoming</p>
          {upcoming.length === 0 ? (
            <p className="text-xs text-gray-400 px-2 py-3">No upcoming meetings</p>
          ) : (
            <div className="space-y-1">
              {upcoming.slice(0,6).map(m => {
                const p = palette(m._id);
                return (
                  <button
                    key={m._id}
                    onClick={() => { setCurrentDate(new Date(m.startTime)); setViewMode("day"); }}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 transition group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.solid }} />
                      <p className="text-xs font-semibold text-gray-900 truncate">{m.title}</p>
                    </div>
                    <p className="text-[10px] text-gray-400 pl-4 mt-0.5">
                      {new Date(m.startTime).toLocaleDateString([],{month:"short",day:"numeric"})}, {fmtTime(m.startTime)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Instant Huddle */}
        <div className="p-3 pt-2 border-t border-gray-100 mt-1">
          <button
            onClick={handleStartInstantHuddle}
            className="w-full py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl flex items-center justify-center gap-1.5 transition"
          >
            <Zap className="size-3.5" /> Start Instant Huddle
          </button>
        </div>
      </aside>

      {/* ═════════════════════════════
          MAIN CALENDAR AREA
      ═════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Toolbar ── */}
        <header className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 bg-white shrink-0 gap-4">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition"
            >
              Today
            </button>
            <div className="flex items-center">
              <button onClick={() => go(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition">
                <ChevronLeft className="size-4" />
              </button>
              <button onClick={() => go(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition">
                <ChevronRight className="size-4" />
              </button>
            </div>
            <h2 className="text-base font-semibold text-gray-900 whitespace-nowrap">{headerLabel}</h2>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-0.5 border border-gray-200 rounded-xl p-1 bg-white shrink-0">
            {[{id:"day",l:"Day"},{id:"week",l:"Week"},{id:"month",l:"Month"}].map(({id,l}) => (
              <button
                key={id}
                onClick={() => setViewMode(id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  viewMode===id ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </header>

        {/* ══════════ WEEK VIEW ══════════ */}
        {viewMode === "week" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Day header row */}
            <div className="flex border-b border-gray-200 bg-white shrink-0">
              <div className="w-14 shrink-0 border-r border-gray-200" />
              {weekDays.map((day,i) => (
                <div
                  key={i}
                  className={`flex-1 flex flex-col items-center justify-center py-2 border-r border-gray-200 last:border-r-0 ${isToday(day)?"bg-blue-50":""}`}
                >
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isToday(day)?"text-blue-600":"text-gray-400"}`}>
                    {DAY_SHORT[i]}
                  </span>
                  <button
                    onClick={() => goToDay(day)}
                    className={`mt-1 w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition ${
                      isToday(day) ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {day.getDate()}
                  </button>
                </div>
              ))}
            </div>

            {/* Scrollable grid */}
            <div className="flex-1 overflow-y-auto" ref={gridScrollRef}>
              <div className="flex">
                {/* Time axis */}
                <div className="w-14 shrink-0 border-r border-gray-200 bg-white relative" style={{minHeight:`${(HOUR_END-HOUR_START)*PX_PER_HR}px`}}>
                  {HOURS.map(h => (
                    <div
                      key={h}
                      className="absolute right-0 pr-2 text-[10px] text-gray-400 font-medium select-none"
                      style={{ top: `${(h-HOUR_START)*PX_PER_HR - 7}px`, lineHeight:"14px" }}
                    >
                      {fmtHour(h)}
                    </div>
                  ))}
                </div>
                {/* Day columns */}
                {weekDays.map((day,i) => (
                  <TimeGridColumn
                    key={i}
                    day={day}
                    layoutedMeetings={layoutForDay(day)}
                    onClickSlot={handleClickSlot}
                    onClickBlock={handleClickBlock}
                    isCurrentDay={isToday(day)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════ DAY VIEW ══════════ */}
        {viewMode === "day" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Day header */}
            <div className={`flex items-center justify-center gap-3 py-3 border-b border-gray-200 shrink-0 ${isToday(currentDate)?"bg-blue-50":""}`}>
              <span className={`text-sm font-bold uppercase tracking-wide ${isToday(currentDate)?"text-blue-600":"text-gray-400"}`}>
                {currentDate.toLocaleDateString([],{weekday:"long"})}
              </span>
              <div className={`w-9 h-9 flex items-center justify-center rounded-full text-lg font-black ${isToday(currentDate)?"bg-blue-600 text-white":"text-gray-900"}`}>
                {currentDate.getDate()}
              </div>
              <span className="text-sm text-gray-400">{currentDate.toLocaleDateString([],{month:"long",year:"numeric"})}</span>
            </div>
            {/* Grid */}
            <div className="flex-1 overflow-y-auto" ref={gridScrollRef}>
              <div className="flex">
                <div className="w-14 shrink-0 border-r border-gray-200 bg-white relative" style={{minHeight:`${(HOUR_END-HOUR_START)*PX_PER_HR}px`}}>
                  {HOURS.map(h => (
                    <div
                      key={h}
                      className="absolute right-0 pr-2 text-[10px] text-gray-400 font-medium select-none"
                      style={{ top: `${(h-HOUR_START)*PX_PER_HR - 7}px`, lineHeight:"14px" }}
                    >
                      {fmtHour(h)}
                    </div>
                  ))}
                </div>
                <TimeGridColumn
                  day={currentDate}
                  layoutedMeetings={layoutForDay(currentDate)}
                  onClickSlot={handleClickSlot}
                  onClickBlock={handleClickBlock}
                  isCurrentDay={isToday(currentDate)}
                />
              </div>
            </div>
          </div>
        )}

        {/* ══════════ MONTH VIEW ══════════ */}
        {viewMode === "month" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-gray-200 shrink-0">
              {DAY_SHORT.map(d => (
                <div key={d} className="text-center text-[11px] font-bold text-gray-400 uppercase tracking-wider py-2 border-r border-gray-100 last:border-r-0">
                  {d}
                </div>
              ))}
            </div>
            {/* Day cells */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-7 h-full" style={{gridAutoRows:"minmax(100px,1fr)"}}>
                {monthGrid.map((day,idx) => {
                  const inMonth = day.getMonth() === currentDate.getMonth();
                  const k       = startOfDay(day).getTime();
                  const dayMs   = meetingsByDay[k] ?? [];
                  return (
                    <div
                      key={idx}
                      className={`border-r border-b border-gray-100 last:border-r-0 p-1 flex flex-col transition ${
                        isToday(day) ? "bg-blue-50/40" : inMonth ? "bg-white hover:bg-gray-50/50" : "bg-gray-50/30"
                      }`}
                    >
                      {/* Day number */}
                      <button
                        onClick={(e) => { e.stopPropagation(); goToDay(day); }}
                        className={`self-start w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold transition mb-1 ${
                          isToday(day)
                            ? "bg-blue-600 text-white"
                            : inMonth
                            ? "text-gray-700 hover:bg-gray-200"
                            : "text-gray-300"
                        }`}
                      >
                        {day.getDate()}
                      </button>
                      {/* Events */}
                      <div className="space-y-0.5 flex-1 overflow-hidden">
                        {dayMs.slice(0,3).map(m => {
                          const p = palette(m._id);
                          return (
                            <button
                              key={m._id}
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                handleClickBlock(m, rect);
                              }}
                              className="w-full text-left rounded px-1.5 py-0.5 text-[10px] font-semibold truncate transition hover:brightness-95"
                              style={{ backgroundColor: p.bg, color: p.text }}
                            >
                              {fmtTime(m.startTime)} {m.title}
                            </button>
                          );
                        })}
                        {dayMs.length > 3 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); goToDay(day); }}
                            className="text-[10px] text-blue-600 hover:underline pl-1.5"
                          >
                            +{dayMs.length - 3} more
                          </button>
                        )}
                      </div>
                      {/* Click empty area → create */}
                      {dayMs.length === 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleClickSlot(day, 9, 0); }}
                          className="flex-1 opacity-0 hover:opacity-100 flex items-center justify-center text-gray-300 text-[10px] gap-1 transition"
                        >
                          <Plus className="size-3" /> Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════ EVENT POPOVER ══════════ */}
      {activeEvent && (
        <EventPopover
          meeting={activeEvent.meeting}
          anchorRect={activeEvent.anchorRect}
          isAdmin={isAdmin}
          onDelete={(id) => { if (window.confirm(`Cancel "${activeEvent.meeting.title}"?`)) cancel(id); }}
          onClose={() => setActiveEvent(null)}
        />
      )}

      {/* ══════════ NEW MEETING MODAL ══════════ */}
      {showModal && (
        <MeetingModal
          channels={channels}
          defaults={modalDefaults}
          isCreating={isCreating}
          onClose={() => setShowModal(false)}
          onSubmit={(data) => schedule(data)}
        />
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   NEW MEETING MODAL
═══════════════════════════════════════════════════════════ */
const MeetingModal = ({ channels, defaults, isCreating, onClose, onSubmit }) => {
  const { authUser } = useAuthUser();
  const now = new Date();
  const defaultDT = toDTLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()+1, 0));

  // "channel" | "individuals"
  const [inviteMode, setInviteMode] = useState("channel");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);  // array of member objects
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef(null);
  const dropRef   = useRef(null);

  const { data: orgMembersData } = useQuery({
    queryKey: ["orgMembers"],
    queryFn:  getOrgMembers,
    staleTime: 60_000,
  });
  const orgMembers = useMemo(() => {
    const all = orgMembersData?.members ?? [];
    // exclude self — always included as host
    return all.filter(m => m._id !== authUser?._id);
  }, [orgMembersData, authUser]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.toLowerCase();
    return orgMembers.filter(m =>
      m.fullName?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
    );
  }, [orgMembers, memberSearch]);

  const toggleMember = (member) => {
    setSelectedMembers(prev =>
      prev.some(m => m._id === member._id)
        ? prev.filter(m => m._id !== member._id)
        : [...prev, member]
    );
  };

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const [form, setForm] = useState({
    title:       defaults?.title     ?? "",
    startTime:   defaults?.startTime ?? defaultDT,
    duration:    defaults?.duration  ?? 30,
    channel:     defaults?.channel   ?? (channels[0]?.name ? `#${channels[0].name}` : "#general"),
    description: "",
  });

  const isTitleMissing = !form.title.trim();
  const isTimePast     = form.startTime && new Date(form.startTime) <= new Date();
  const isValid        = !isTitleMissing && form.startTime && !isTimePast;
  const set            = (k,v) => setForm(f => ({...f,[k]:v}));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;
    const participants = inviteMode === "individuals"
      ? [authUser._id, ...selectedMembers.map(m => m._id)]
      : undefined;
    onSubmit({ ...form, participants });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <CalendarDays className="size-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">New Meeting</h3>
              <p className="text-xs text-gray-400">Schedule a sync or huddle</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3.5 overflow-y-auto flex-1">
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Title <span className="text-red-400">*</span></label>
            <input
              autoFocus type="text" placeholder="e.g. Weekly Product Sync"
              value={form.title} onChange={e => set("title",e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition placeholder-gray-300"
            />
          </div>

          {/* Date + Duration row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Start Date & Time <span className="text-red-400">*</span></label>
              <input
                type="datetime-local" value={form.startTime} onChange={e => set("startTime",e.target.value)}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 transition ${isTimePast?"border-red-300 focus:ring-red-500/20 focus:border-red-400":"border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"}`}
              />
              {isTimePast && <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="size-3" /> Must be in the future</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Duration</label>
              <select value={form.duration} onChange={e => set("duration",parseInt(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white transition"
              >
                {DURATIONS.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}
              </select>
            </div>
          </div>

          {/* Invite Mode toggle */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Invite via</label>
            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
              <button
                type="button"
                onClick={() => setInviteMode("channel")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition ${
                  inviteMode === "channel" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Hash className="size-3.5" /> Channel
              </button>
              <button
                type="button"
                onClick={() => setInviteMode("individuals")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition ${
                  inviteMode === "individuals" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <UserPlus className="size-3.5" /> Individuals
              </button>
            </div>
          </div>

          {/* Channel picker */}
          {inviteMode === "channel" && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Channel</label>
              {channels.length > 0 ? (
                <select value={form.channel} onChange={e => set("channel",e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white transition"
                >
                  {channels.map(ch => <option key={ch._id} value={`#${ch.name}`}>#{ch.name}</option>)}
                </select>
              ) : (
                <input type="text" placeholder="#general" value={form.channel} onChange={e => set("channel",e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
                />
              )}
            </div>
          )}

          {/* Individuals picker */}
          {inviteMode === "individuals" && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Invite People
                <span className="ml-1.5 text-gray-400 font-normal">(you are automatically included)</span>
              </label>

              {/* Selected chips */}
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedMembers.map(m => (
                    <span
                      key={m._id}
                      className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold border border-blue-100"
                    >
                      <Avatar src={m.profilePic} name={m.fullName} size="w-4 h-4" />
                      {m.fullName?.split(" ")[0]}
                      <button
                        type="button"
                        onClick={() => toggleMember(m)}
                        className="ml-0.5 hover:text-red-500 transition"
                      ><X className="size-2.5" /></button>
                    </span>
                  ))}
                </div>
              )}

              {/* Searchable dropdown */}
              <div className="relative" ref={dropRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Search by name or email…"
                    value={memberSearch}
                    onChange={e => { setMemberSearch(e.target.value); setDropdownOpen(true); }}
                    onFocus={() => setDropdownOpen(true)}
                    className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition placeholder-gray-300"
                  />
                </div>

                {dropdownOpen && filteredMembers.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
                    <div className="max-h-44 overflow-y-auto divide-y divide-gray-50">
                      {filteredMembers.map(member => {
                        const isSelected = selectedMembers.some(m => m._id === member._id);
                        return (
                          <button
                            key={member._id}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); toggleMember(member); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 transition ${
                              isSelected ? "bg-blue-50" : ""
                            }`}
                          >
                            <Avatar src={member.profilePic} name={member.fullName} size="w-7 h-7" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{member.fullName}</p>
                              {member.email && <p className="text-[10px] text-gray-400 truncate">{member.email}</p>}
                            </div>
                            {isSelected && <Check className="size-3.5 text-blue-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {dropdownOpen && filteredMembers.length === 0 && memberSearch && (
                  <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-xl px-4 py-3">
                    <p className="text-sm text-gray-400 text-center">No members found for "{memberSearch}"</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={2} placeholder="What's this meeting about?" value={form.description} onChange={e => set("description",e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition resize-none placeholder-gray-300"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
            >Cancel</button>
            <button type="submit" disabled={isCreating || !isValid}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-xl transition flex items-center justify-center gap-2"
            >
              {isCreating && <Loader2 className="size-4 animate-spin" />}
              Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SchedulePage;
