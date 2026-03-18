import Meeting from "../models/Meeting.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import { sendMeetingEmail } from "./email.js";

const REMINDER_WINDOW_MINUTES = Number(process.env.MEETING_REMINDER_WINDOW_MINUTES || 10);

/**
 * Sends a meeting reminder immediately if data is valid.
 */
const sendSingleMeetingReminder = async (meeting) => {
  try {
    if (!meeting?.participants?.length) {
      return false;
    }

    const hostId = meeting.participants[0];
    const host = await User.findById(hostId).select("fullName email").lean();
    if (!host) {
      return false;
    }

    let allTargetIds = [...meeting.participants];

    if (meeting.channel && meeting.organization) {
      const org = await Organization.findById(meeting.organization).lean();
      if (org) {
        const channelNameStr = meeting.channel.replace(/^#/, "").toLowerCase();
        const channel = org.channels.find((entry) => entry.name.toLowerCase() === channelNameStr);
        if (channel?.members?.length) {
          allTargetIds = [...allTargetIds, ...channel.members];
        }
      }
    }

    const uniqueTargetIds = [...new Set(allTargetIds.map((id) => String(id)))];
    const participants = await User.find({ _id: { $in: uniqueTargetIds } }).select("email").lean();
    const emails = participants.map((participant) => participant.email).filter(Boolean);

    if (emails.length === 0) {
      return false;
    }

    const meetingDetails = {
      ...meeting,
      meetingLink: meeting.meetingLink || `${process.env.FRONTEND_URL}/call/${meeting._id}`,
    };

    await sendMeetingEmail({ emails, meetingDetails, host });
    return true;
  } catch (error) {
    console.error("Failed to send meeting reminder:", error);
    return false;
  }
};

/**
 * Finds due meetings and sends reminders once.
 */
export const sendDueMeetingReminders = async (now = new Date()) => {
  const windowStart = new Date(now.getTime() - REMINDER_WINDOW_MINUTES * 60 * 1000);

  const dueMeetings = await Meeting.find({
    startTime: { $gte: windowStart, $lte: now },
    reminderSentAt: { $exists: false },
  }).lean();

  let sentCount = 0;
  for (const meeting of dueMeetings) {
    const sent = await sendSingleMeetingReminder(meeting);
    if (!sent) continue;

    await Meeting.updateOne(
      {
        _id: meeting._id,
        reminderSentAt: { $exists: false },
      },
      {
        $set: { reminderSentAt: now },
      }
    );

    sentCount += 1;
  }

  return {
    processedMeetings: dueMeetings.length,
    sentReminders: sentCount,
    windowStart,
    now,
  };
};

/**
 * Retained for compatibility with local runtime startup. Vercel should use Cron.
 */
export const initScheduler = async () => {
  if (process.env.VERCEL) {
    console.log("Scheduler initialization skipped on Vercel. Use cron endpoint for reminders.");
    return;
  }

  console.log("In-process meeting scheduler disabled. Run cron route to dispatch reminders.");
};
