import Meeting from "../models/Meeting.js";

const resolveFrontendBaseUrl = (req) => {
    if (process.env.FRONTEND_URL) {
        return process.env.FRONTEND_URL.replace(/\/$/, "");
    }

    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = req.headers["x-forwarded-host"] || req.get("host");
    return `${protocol}://${host}`;
};

export const getMeetings = async (req, res) => {
    try {
        const organizationId = req.user.organization;
        if (!organizationId) {
            return res.status(400).json({ message: "User does not belong to an organization" });
        }

        // Support optional ?from=ISO&to=ISO for calendar range queries
        const filter = { organization: organizationId };
        if (req.query.from || req.query.to) {
            filter.startTime = {};
            if (req.query.from) filter.startTime.$gte = new Date(req.query.from);
            if (req.query.to)   filter.startTime.$lte = new Date(req.query.to);
        }

        const meetings = await Meeting.find(filter)
            .populate("participants", "fullName profilePic")
            .sort({ startTime: 1 })
            .lean();

        res.status(200).json(meetings);
    } catch (error) {
        console.error("Error in getMeetings controller:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const createMeeting = async (req, res) => {
    try {
        const { title, startTime, duration, participants, channel } = req.body;
        const organizationId = req.user.organization;

        if (!organizationId) {
            return res.status(400).json({ message: "User does not belong to an organization" });
        }

        if (!title?.trim()) {
            return res.status(400).json({ message: "Meeting title is required" });
        }

        if (!startTime) {
            return res.status(400).json({ message: "Start time is required" });
        }

        if (!channel?.trim()) {
            return res.status(400).json({ message: "Channel is required" });
        }

        const start = new Date(startTime);
        if (isNaN(start.getTime())) {
            return res.status(400).json({ message: "Invalid start time" });
        }

        if (start <= new Date()) {
            return res.status(400).json({ message: "Start time must be in the future" });
        }

        const parsedDuration = Number(duration);
        if (!parsedDuration || parsedDuration <= 0 || parsedDuration > 1440) {
            return res.status(400).json({ message: "Duration must be between 1 and 1440 minutes" });
        }

        const newMeeting = new Meeting({
            title: title.trim(),
            startTime: start,
            duration: parsedDuration,
            participants: participants || [req.user._id],
            channel,
            organization: organizationId,
            // Automatically assign the meeting link based on frontend URL and new meeting ID
        });
        
        // Save first so we have the ID to construct the link and schedule it
        await newMeeting.save();
        
        newMeeting.meetingLink = `${resolveFrontendBaseUrl(req)}/call/${newMeeting._id}`;
        await newMeeting.save();

        res.status(201).json(newMeeting);
    } catch (error) {
        console.error("Error in createMeeting controller:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const deleteMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const meeting = await Meeting.findById(id);

        if (!meeting) {
            return res.status(404).json({ message: "Meeting not found" });
        }

        if (!["admin", "owner"].includes(req.user.role)) {
            return res.status(403).json({ message: "Only admins/owners can delete meetings" });
        }

        await Meeting.findByIdAndDelete(id);

        res.status(200).json({ message: "Meeting deleted" });
    } catch (error) {
        console.error("Error in deleteMeeting controller:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
