import express from "express";
import { runMeetingReminderCron } from "../controllers/internal.controller.js";

const router = express.Router();

router.get("/cron/meeting-reminders", runMeetingReminderCron);

export default router;