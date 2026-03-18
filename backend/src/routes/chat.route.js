import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getStreamToken, ensureOrgChannel } from "../controllers/chat.controller.js";

const router = express.Router();

router.get("/token",          protectRoute, getStreamToken);
router.post("/ensure-channel", protectRoute, ensureOrgChannel);

export default router;
