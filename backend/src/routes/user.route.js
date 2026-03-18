import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  acceptFriendRequest,
  checkUserCodeAvailability,
  declineFriendRequest,
  getDashboardSummary,
  getFriendRequests,
  getMyFriends,
  getOutgoingFriendReqs,
  getRecommendedUsers,
  lookupUserById,
  sendFriendRequest,
  streamNotifications,
} from "../controllers/user.controller.js";


const router = express.Router();

// apply auth middleware to all routes
router.use(protectRoute);

router.get("/dashboard-summary", getDashboardSummary);
router.get("/stream", streamNotifications);
router.get("/user-code/availability", checkUserCodeAvailability);
router.get("/lookup/:id", lookupUserById);
router.get("/", getRecommendedUsers);
router.get("/friends", getMyFriends);

router.post("/friend-request/:id", sendFriendRequest);
router.put("/friend-request/:id/accept", acceptFriendRequest);
router.delete("/friend-request/:id/decline", declineFriendRequest);


router.get("/friend-requests", getFriendRequests);
router.get("/outgoing-friend-requests", getOutgoingFriendReqs);

export default router;
