import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ["document", "image", "link", "other"],
            default: "other",
        },
        size: {
            type: Number, // raw bytes — format on the client
            required: true,
        },
        cloudinaryPublicId: {
            type: String,
            default: "",
        },
        url: {
            type: String,
            required: true,
        },
        sharedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },
        channel: {
            type: String, // Optional channel name or ID
        },
        folder: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Folder",
            default: null,
        },
    },
    { timestamps: true }
);

// Index for fast organization-scoped file lookups
fileSchema.index({ organization: 1, createdAt: -1 });
fileSchema.index({ folder: 1 });

const File = mongoose.model("File", fileSchema);

export default File;
