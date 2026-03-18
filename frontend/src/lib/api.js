import { axiosInstance } from "./axios";
import { clearCachedAuthUser, setCachedAuthUser } from "./authCache";
import { clearCachedDashboardSummary, setCachedDashboardSummary } from "./dashboardCache";

export const signup = async (signupData) => {
  const response = await axiosInstance.post("/auth/signup", signupData);
  return response.data;
};

export const login = async (loginData) => {
  const response = await axiosInstance.post("/auth/login", loginData);
  return response.data;
};
export const logout = async () => {
  const response = await axiosInstance.post("/auth/logout");
  return response.data;
};

export const getAuthUser = async () => {
  try {
    const res = await axiosInstance.get("/auth/me");
    setCachedAuthUser(res.data);
    return res.data;
  } catch (error) {
    console.log("Error in getAuthUser:", error);
    clearCachedAuthUser();
    return null;
  }
};

export const completeOnboarding = async (userData) => {
  const response = await axiosInstance.post("/auth/onboarding", userData);
  return response.data;
};

export const updateProfile = async (data) => {
  const res = await axiosInstance.put("/auth/profile", data);
  return res.data;
};

/* ── FILE MANAGEMENT ── */
export const getFiles = async () => {
  const res = await axiosInstance.get("/files");
  return res.data;
};

export const uploadFile = async (data) => {
  const res = await axiosInstance.post("/files/upload", data);
  return res.data;
};

export const deleteFile = async (id) => {
  const res = await axiosInstance.delete(`/files/${id}`);
  return res.data;
};

export const moveFile = async ({ fileId, folderId }) => {
  const res = await axiosInstance.patch(`/files/${fileId}/move`, { folderId: folderId || null });
  return res.data;
};

/* ── FOLDERS ── */
export const getFolders = async () => {
  const res = await axiosInstance.get("/folders");
  return res.data;
};

export const createFolder = async (name) => {
  const res = await axiosInstance.post("/folders", { name });
  return res.data;
};

export const deleteFolder = async (id) => {
  const res = await axiosInstance.delete(`/folders/${id}`);
  return res.data;
};

/* ── MEETINGS / HUDDLES ── */
export const getMeetings = async ({ from, to } = {}) => {
  const params = {};
  if (from) params.from = from;
  if (to)   params.to   = to;
  const res = await axiosInstance.get("/meetings", { params });
  return res.data;
};

export const createMeeting = async (data) => {
  const res = await axiosInstance.post("/meetings/create", data);
  return res.data;
};

export const deleteMeeting = async (id) => {
  const res = await axiosInstance.delete(`/meetings/${id}`);
  return res.data;
};




export async function getUserFriends() {
  const response = await axiosInstance.get("/users/friends");
  return response.data;
}

export async function lookupUserById(userId) {
  const response = await axiosInstance.get(`/users/lookup/${userId}`);
  return response.data;
}

export async function checkUserCodeAvailability(code) {
  const response = await axiosInstance.get("/users/user-code/availability", {
    params: { code },
  });
  return response.data;
}

export async function getDashboardSummary() {
  try {
    const response = await axiosInstance.get("/users/dashboard-summary");
    setCachedDashboardSummary(response.data);
    return response.data;
  } catch (error) {
    clearCachedDashboardSummary();
    throw error;
  }
}

/* ── TRANSCRIPTS ── */
export const saveTranscriptEntries = async (callId, entries) => {
  // Backend expects `entryId`; local entries use `id` for dedup — map here.
  const mapped = (entries || []).map((e) => ({ ...e, entryId: e.entryId || e.id }));
  const res = await axiosInstance.post(`/transcripts/${callId}/entries`, { entries: mapped });
  return res.data;
};

export const getTranscript = async (callId) => {
  const res = await axiosInstance.get(`/transcripts/${callId}`);
  return res.data;
};

export const getTranscriptSummary = async (callId) => {
  const res = await axiosInstance.get(`/transcripts/${callId}/summary`);
  return res.data;
};

export async function getRecommendedUsers() {
  const response = await axiosInstance.get("/users");
  return response.data;
}

export async function getOutgoingFriendReqs() {
  const response = await axiosInstance.get("/users/outgoing-friend-requests");
  return response.data;
}

export async function sendFriendRequest(userId) {
  const response = await axiosInstance.post(`/users/friend-request/${userId}`);
  return response.data;
}

export async function getFriendRequests() {
  const response = await axiosInstance.get("/users/friend-requests");
  return response.data;
}

export async function acceptFriendRequest(requestId) {
  const response = await axiosInstance.put(`/users/friend-request/${requestId}/accept`);
  return response.data;
}

export async function declineFriendRequest(requestId) {
  const response = await axiosInstance.delete(`/users/friend-request/${requestId}/decline`);
  return response.data;
}


export async function getStreamToken() {
  const response = await axiosInstance.get("/chat/token");
  return response.data;
}

/* ── Organization ─────────────────────────────────────────── */
export async function getMyOrganization() {
  const response = await axiosInstance.get("/organizations/me");
  return response.data;
}

export async function ensureOrgChannel(channelId) {
  const response = await axiosInstance.post("/chat/ensure-channel", { channelId });
  return response.data;
}

export async function createOrganization(data) {
  const response = await axiosInstance.post("/organizations/create", data);
  return response.data;
}

export async function joinOrganization(data) {
  const response = await axiosInstance.post("/organizations/join", data);
  return response.data;
}

export async function regenerateInviteCode() {
  const response = await axiosInstance.post("/organizations/regenerate-code");
  return response.data;
}

export async function updateOrganizationSettings(data) {
  const response = await axiosInstance.put("/organizations/settings", data);
  return response.data;
}

export async function createOrgChannel(data) {
  const response = await axiosInstance.post("/organizations/channels", data);
  return response.data;
}

export async function deleteOrgChannel(channelId) {
  const response = await axiosInstance.delete(`/organizations/channels/${channelId}`);
  return response.data;
}

export async function getOrgMembers() {
  const response = await axiosInstance.get("/organizations/members");
  return response.data;
}


/* ── Call Logs ── */
export const saveCallLogApi = async (data) => {
  const res = await axiosInstance.post("/call-logs", data);
  return res.data;
};

export const getCallLogsApi = async () => {
  const res = await axiosInstance.get("/call-logs");
  return res.data;
};
