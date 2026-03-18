export const recordUserActivity = () => {
  if (typeof window !== "undefined") {
    window.__collabLastActive = Date.now();
  }
};

export const getLocalLastActive = () => {
  if (typeof window !== "undefined") {
    return window.__collabLastActive || Date.now();
  }
  return Date.now();
};

// Initialize listeners to track active user usage
if (typeof window !== "undefined") {
  const events = ["mousedown", "keydown", "scroll", "touchstart"];
  const throttledRecord = () => {
    recordUserActivity();
  };
  events.forEach((evt) => window.addEventListener(evt, throttledRecord, { passive: true }));
}

export const getPresenceMeta = (user) => {
  const offlineMeta = {
    dotClassName: "bg-error",
    label: "Offline",
    textClassName: "text-error",
    isOnline: false,
  };

  if (!user) {
    return offlineMeta;
  }

  let isActuallyOnline = user.online;
  let diffMinutes = null;

  let latestTime = 0;
  if (user.last_active) {
    latestTime = new Date(user.last_active).getTime();
  }

  // If this user is the one currently logged in/using this browser instance,
  // we check the global activity tracker as a fallback.
  // Note: We apply this check to everyone for simplicity, but it mainly 
  // benefits the local user whose `__collabLastActive` is being constantly updated.
  if (user._id && typeof window !== "undefined" && window.__collabAuthUserId === user._id) {
    latestTime = Math.max(latestTime, getLocalLastActive());
  }

  if (latestTime > 0) {
    diffMinutes = Math.max(0, Math.floor((Date.now() - latestTime) / 60000));

    // TTL: Consider offline if no activity for 5 minutes, even if socket is connected
    if (diffMinutes >= 5) {
      isActuallyOnline = false;
    } else {
      // If we had activity in the last 5 minutes, force online even if socket says false
      // This handles cases where user_updated events reset socket `online` to false improperly
      isActuallyOnline = true;
    }
  }

  if (isActuallyOnline) {
    return {
      dotClassName: "bg-success animate-pulse",
      label: "Online",
      textClassName: "text-success",
      isOnline: true,
    };
  }

  return offlineMeta;
};

export const mergePresenceUser = (baseUser, presenceUser) => {
  if (!baseUser && !presenceUser) return null;
  return {
    ...(baseUser || {}),
    ...(presenceUser || {}),
    image: presenceUser?.image || baseUser?.image || baseUser?.profilePic || "",
    profilePic: presenceUser?.image || baseUser?.profilePic || baseUser?.image || "",
    name: presenceUser?.name || baseUser?.name || baseUser?.fullName || "",
    fullName: presenceUser?.name || baseUser?.fullName || baseUser?.name || "",
    id: presenceUser?.id || baseUser?.id || baseUser?._id,
    _id: presenceUser?.id || baseUser?._id || baseUser?.id,
  };
};
