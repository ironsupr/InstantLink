import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    callId: {
      type: String,
      required: true,
      unique: true,
    },
    conversationId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["video", "audio"],
      default: "video",
    },
    status: {
      type: String,
      enum: ["ringing", "started", "ongoing", "left", "ended", "missed", "rejected"],
      default: "started",
    },
    isChannel: {
      type: Boolean,
      default: false,
    },
    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    participantIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // For fast frontend rendering without requiring heavy .populate() queries on every load
    participants: {
      type: [String],
      default: [],
    },
    participantProfiles: {
      type: [Object],
      default: [],
    },
    startTime: {
      type: Date,
    },
    endTime: {
      type: Date,
    },
    conversationName: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

const CallLog = mongoose.model("CallLog", callLogSchema);
export default CallLog;
