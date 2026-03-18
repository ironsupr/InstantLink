import CallLog from "../models/CallLog.js";
import mongoose from "mongoose";

const toObjectIdString = (value) => {
  if (!value) return null;
  const asString = value.toString();
  return mongoose.Types.ObjectId.isValid(asString) ? asString : null;
};

const extractMemberIdsFromConversationId = (conversationId) => {
  if (!conversationId || typeof conversationId !== "string") return [];

  // DM conversation IDs commonly look like "messaging:!members-<id1>-<id2>"
  const marker = "!members-";
  const markerIndex = conversationId.indexOf(marker);
  if (markerIndex === -1) return [];

  return conversationId
    .slice(markerIndex + marker.length)
    .split("-")
    .map((part) => toObjectIdString(part))
    .filter(Boolean);
};

// @route   POST /api/call-logs
// @desc    Upserts (creates or updates) a call log
export const saveCallLog = async (req, res) => {
  try {
    const userId = req.user?._id;
    const userIdString = toObjectIdString(userId);
    const {
      callId,
      conversationId,
      type,
      status,
      isChannel,
      hostId,
      participantIds,
      participants,
      participantProfiles,
      startTime,
      endTime,
      conversationName,
    } = req.body;

    if (!callId || !conversationId) {
      return res.status(400).json({ message: "callId and conversationId are required" });
    }

    if (!userIdString) {
      return res.status(401).json({ message: "Unauthorized user" });
    }

    // Load current log first so we can prevent unrelated users from mutating records.
    const existingLog = await CallLog.findOne({ callId });

    if (existingLog) {
      const isHost = existingLog.hostId?.toString() === userIdString;
      const isParticipant = Array.isArray(existingLog.participantIds)
        ? existingLog.participantIds.some((id) => id?.toString() === userIdString)
        : false;
      const isDmMemberByConversationId = extractMemberIdsFromConversationId(existingLog.conversationId).includes(
        userIdString
      );

      if (!isHost && !isParticipant && !isDmMemberByConversationId) {
        return res.status(403).json({ message: "You are not allowed to update this call log" });
      }
    }

    const profileParticipantIds = Array.isArray(participantProfiles)
      ? participantProfiles.map((profile) => toObjectIdString(profile?.id)).filter(Boolean)
      : [];
    const conversationMemberIds = extractMemberIdsFromConversationId(conversationId);

    const normalizedParticipantIds = Array.from(
      new Set(
        [
          ...(Array.isArray(existingLog?.participantIds) ? existingLog.participantIds : []),
          ...(Array.isArray(participantIds) ? participantIds : []),
          ...profileParticipantIds,
          ...conversationMemberIds,
          userIdString,
        ]
          .filter(Boolean)
          .map((id) => toObjectIdString(id))
          .filter(Boolean)
      )
    );

    const resolvedHostId =
      toObjectIdString(hostId) || toObjectIdString(existingLog?.hostId) || userIdString;

    const log = await CallLog.findOneAndUpdate(
      { callId },
      {
        $set: {
          conversationId,
          type,
          status,
          isChannel,
          hostId: resolvedHostId,
          participantIds: normalizedParticipantIds,
          ...(participants ? { participants } : {}),
          ...(participantProfiles ? { participantProfiles } : {}),
          // Set start/end times if provided
          ...(startTime ? { startTime } : {}),
          ...(endTime ? { endTime } : {}),
          ...(conversationName !== undefined ? { conversationName } : {}),
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ message: "Call log saved successfully", log });
  } catch (error) {
    console.error("Error in saveCallLog controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// @route   GET /api/call-logs
// @desc    Gets call logs relevant to the logged-in user
export const getCallLogs = async (req, res) => {
  try {
    const userId = req.user._id;
    const userIdString = userId?.toString();

    if (!userIdString) {
      return res.status(401).json({ message: "Unauthorized user" });
    }

    const callLogs = await CallLog.find({
      $or: [
        { hostId: userId },
        { participantIds: userId },
        { "participantProfiles.id": userIdString },
        {
          $and: [
            { isChannel: false },
            { conversationId: { $regex: userIdString } },
          ],
        },
      ],
    })
      .sort({ createdAt: -1, startTime: -1, updatedAt: -1 })
      .limit(100);

    res.status(200).json(callLogs);
  } catch (error) {
    console.error("Error in getCallLogs controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
