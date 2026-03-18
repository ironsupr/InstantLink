import { sendDueMeetingReminders } from "../lib/scheduler.js";

const isAuthorizedCronRequest = (req) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return false;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  return token === expected;
};

export const runMeetingReminderCron = async (req, res) => {
  if (!isAuthorizedCronRequest(req)) {
    return res.status(401).json({ message: "Unauthorized cron request" });
  }

  try {
    const result = await sendDueMeetingReminders(new Date());
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Error running meeting reminder cron", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};