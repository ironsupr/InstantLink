import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
    createOrganization,
    joinOrganization,
    getMyOrganization,
    regenerateInviteCode,
    updateOrganizationSettings,
    createChannel,
    deleteChannel,
    getOrgMembers,
} from "../controllers/organization.controller.js";

const router = express.Router();

router.use(protectRoute); // all org routes require auth

router.get("/me", getMyOrganization);
router.get("/members", getOrgMembers);
router.post("/create", createOrganization);
router.post("/join", joinOrganization);
router.post("/regenerate-code", regenerateInviteCode);
router.put("/settings", updateOrganizationSettings);
router.post("/channels", createChannel);
router.delete("/channels/:channelId", deleteChannel);

export default router;
