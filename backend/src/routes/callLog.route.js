import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { saveCallLog, getCallLogs } from "../controllers/callLog.controller.js";

const router = express.Router();

// Require user to be authenticated for all call log operations
router.use(protectRoute);

router.post("/", saveCallLog);
router.get("/", getCallLogs);

export default router;
