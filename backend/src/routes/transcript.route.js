import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { addTranscriptEntries, getTranscript, getTranscriptSummary } from "../controllers/transcript.controller.js";

const router = express.Router();

router.get("/:callId", protectRoute, getTranscript);
router.get("/:callId/summary", protectRoute, getTranscriptSummary);
router.post("/:callId/entries", protectRoute, addTranscriptEntries);

export default router;
