import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getMeetings, createMeeting, deleteMeeting } from "../controllers/meeting.controller.js";

const router = express.Router();

router.get("/", protectRoute, getMeetings);
router.post("/create", protectRoute, createMeeting);
router.delete("/:id", protectRoute, deleteMeeting);

export default router;
