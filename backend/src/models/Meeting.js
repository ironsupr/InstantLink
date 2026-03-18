import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        startTime: {
            type: Date,
            required: true,
        },
        duration: {
            type: Number, // duration in minutes
            required: true,
        },
        participants: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        channel: {
            type: String, // e.g. "#general" or a specific channel slug
            required: true,
        },
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },
        meetingLink: {
            type: String, // External link or internal stream call ID
        },
        reminderSentAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

// Index for fast lookup of upcoming meetings within an organization
meetingSchema.index({ organization: 1, startTime: 1 });

const Meeting = mongoose.model("Meeting", meetingSchema);

export default Meeting;
