import mongoose from "mongoose";

const transcriptEntrySchema = new mongoose.Schema({
  entryId: { type: String, required: true },
  speakerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  speakerName: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, required: true },
});

const transcriptSchema = new mongoose.Schema(
  {
    callId: { type: String, required: true, unique: true, index: true },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    entries: [transcriptEntrySchema],
    cloudinaryUrl: { type: String },
    summary: { type: String },
  },
  { timestamps: true }
);

const Transcript = mongoose.model("Transcript", transcriptSchema);

export default Transcript;
