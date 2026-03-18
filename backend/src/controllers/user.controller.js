import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import File from "../models/File.js";
import Meeting from "../models/Meeting.js";
import mongoose from "mongoose";
import {
  emitNotificationEvent,
  subscribeNotificationStream,
  unsubscribeNotificationStream,
} from "../lib/notificationStream.js";

const USER_CODE_REGEX = /^[A-Z0-9]{6}$/;

const getTodayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

export async function getRecommendedUsers(req, res) {
  try {
    const currentUser = req.user; // already loaded by middleware

    const filter = {
      $and: [
        { _id: { $ne: currentUser._id } },
        { _id: { $nin: currentUser.friends } },
        { isOnboarded: true },
      ],
    };

    if (currentUser.organization) {
      filter.$and.push({ organization: currentUser.organization });
    }

    const recommendedUsers = await User.find(filter)
      .select("fullName profilePic nativeLanguage learningLanguage bio location")
      .lean();
    res.status(200).json(recommendedUsers);
  } catch (error) {
    console.error("Error in getRecommendedUsers controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getDashboardSummary(req, res) {
  try {
    const organizationId = req.user.organization;
    const { start, end } = getTodayRange();

    const emptySummary = {
      todayMeetings: [],
      recentFiles: [],
      members: [],
      incomingReqs: [],
      acceptedReqs: [],
    };

    if (!organizationId) {
      return res.status(200).json(emptySummary);
    }

    const [todayMeetings, recentFiles, members, incomingReqs, acceptedReqs] = await Promise.all([
      Meeting.find({
        organization: organizationId,
        startTime: { $gte: start, $lte: end },
      })
        .populate("participants", "fullName profilePic")
        .sort({ startTime: 1 })
        .lean(),
      File.find({ organization: organizationId })
        .select("name updatedAt")
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean(),
      User.find({ organization: organizationId, isOnboarded: true })
        .select("fullName profilePic role")
        .sort({ updatedAt: -1 })
        .limit(6)
        .lean(),
      FriendRequest.find({ recipient: req.user.id, status: "pending" })
        .populate("sender", "fullName profilePic nativeLanguage learningLanguage")
        .sort({ createdAt: -1 })
        .limit(4)
        .lean(),
      FriendRequest.find({ sender: req.user.id, status: "accepted" })
        .populate("recipient", "fullName profilePic")
        .sort({ updatedAt: -1 })
        .limit(4)
        .lean(),
    ]);

    res.status(200).json({
      todayMeetings,
      recentFiles,
      members,
      incomingReqs,
      acceptedReqs,
    });
  } catch (error) {
    console.error("Error in getDashboardSummary controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}


export async function getMyFriends(req, res) {
  try {
    // req.user already has friends[] ids from middleware — skip refetching
    const friendIds = req.user.friends;
    if (!friendIds?.length) return res.status(200).json([]);

    const friends = await User.find({ _id: { $in: friendIds } })
      .select("fullName profilePic nativeLanguage learningLanguage")
      .lean();

    res.status(200).json(friends);
  } catch (error) {
    console.error("Error in getMyFriends controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function lookupUserById(req, res) {
  try {
    const rawId = (req.params.id || "").trim();
    if (!rawId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const normalizedCode = rawId.toUpperCase();
    const isObjectId = mongoose.Types.ObjectId.isValid(rawId);

    const lookupQuery = isObjectId
      ? { $or: [{ _id: rawId }, { userCode: normalizedCode }] }
      : { userCode: normalizedCode };

    const user = await User.findOne(lookupQuery)
      .select("_id userCode fullName profilePic nativeLanguage learningLanguage bio location organization")
      .lean();

    if (!user || !user.fullName) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ message: "You cannot look up yourself" });
    }

    if (req.user.friends?.some((friendId) => friendId.toString() === user._id.toString())) {
      return res.status(200).json({
        success: true,
        user: {
          ...user,
          isFriend: true,
          sameOrganization: !!(req.user.organization && user.organization && req.user.organization.toString() === user.organization.toString()),
        },
      });
    }

    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: req.user.id, recipient: user._id },
        { sender: user._id, recipient: req.user.id },
      ],
    }).select("status sender recipient").lean();

    res.status(200).json({
      success: true,
      user: {
        ...user,
        isFriend: false,
        sameOrganization: !!(req.user.organization && user.organization && req.user.organization.toString() === user.organization.toString()),
      },
      existingRequest,
    });
  } catch (error) {
    console.error("Error in lookupUserById controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function checkUserCodeAvailability(req, res) {
  try {
    const code = (req.query.code || "").toString().trim().toUpperCase();
    if (!USER_CODE_REGEX.test(code)) {
      return res.status(400).json({ message: "User ID must be exactly 6 letters or digits" });
    }

    const existing = await User.findOne({ userCode: code }).select("_id").lean();
    return res.status(200).json({ available: !existing, code });
  } catch (error) {
    console.error("Error in checkUserCodeAvailability controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function sendFriendRequest(req, res) {
  try {
    const myId = req.user.id;
    const { id: recipientId } = req.params;

    // prevent sending req to yourself
    if (myId === recipientId) {
      return res.status(400).json({ message: "You can't send friend request to yourself" });
    }

    // Run recipient lookup + existing-request check in parallel
    const [recipient, existingRequest] = await Promise.all([
      User.findById(recipientId).select("friends organization").lean(),
      FriendRequest.findOne({
        $or: [
          { sender: myId, recipient: recipientId },
          { sender: recipientId, recipient: myId },
        ],
      }).lean(),
    ]);

    if (!recipient) {
      return res.status(404).json({ message: "Recipient not found" });
    }

    // check if user is already friends
    if (recipient.friends.some((f) => f.toString() === myId)) {
      return res.status(400).json({ message: "You are already friends with this user" });
    }

    if (existingRequest) {
      return res
        .status(400)
        .json({ message: "A friend request already exists between you and this user" });
    }

    const friendRequest = await FriendRequest.create({
      sender: myId,
      recipient: recipientId,
    });

    emitNotificationEvent(recipientId, {
      type: "friend-request:new",
      friendRequestId: friendRequest._id,
      sender: myId,
    });

    res.status(201).json(friendRequest);
  } catch (error) {
    console.error("Error in sendFriendRequest controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function acceptFriendRequest(req, res) {
  try {
    const { id: requestId } = req.params;

    const friendRequest = await FriendRequest.findById(requestId);

    if (!friendRequest) {
      return res.status(404).json({ message: "Friend request not found" });
    }

    // Verify the current user is the recipient
    if (friendRequest.recipient.toString() !== req.user.id) {
      return res.status(403).json({ message: "You are not authorized to accept this request" });
    }

    friendRequest.status = "accepted";

    // Save status + update both friends arrays in parallel
    await Promise.all([
      friendRequest.save(),
      User.findByIdAndUpdate(friendRequest.sender, {
        $addToSet: { friends: friendRequest.recipient },
      }),
      User.findByIdAndUpdate(friendRequest.recipient, {
        $addToSet: { friends: friendRequest.sender },
      }),
    ]);

    emitNotificationEvent(friendRequest.sender.toString(), {
      type: "friend-request:accepted",
      friendRequestId: friendRequest._id,
      recipient: friendRequest.recipient,
    });

    res.status(200).json({ message: "Friend request accepted" });
  } catch (error) {
    console.log("Error in acceptFriendRequest controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
export async function declineFriendRequest(req, res) {
  try {
    const { id: requestId } = req.params;

    const friendRequest = await FriendRequest.findById(requestId);

    if (!friendRequest) {
      return res.status(404).json({ message: "Friend request not found" });
    }

    // Verify the current user is the recipient
    if (friendRequest.recipient.toString() !== req.user.id) {
      return res.status(403).json({ message: "You are not authorized to decline this request" });
    }

    await FriendRequest.findByIdAndDelete(requestId);

    emitNotificationEvent(friendRequest.sender.toString(), {
      type: "friend-request:declined",
      friendRequestId: friendRequest._id,
      recipient: friendRequest.recipient,
    });

    res.status(200).json({ message: "Friend request declined" });
  } catch (error) {
    console.log("Error in declineFriendRequest controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getFriendRequests(req, res) {
  try {
    // Both queries are independent — run in parallel
    const [incomingReqs, acceptedReqs] = await Promise.all([
      FriendRequest.find({ recipient: req.user.id, status: "pending" })
        .populate("sender", "fullName profilePic nativeLanguage learningLanguage")
        .lean(),
      FriendRequest.find({ sender: req.user.id, status: "accepted" })
        .populate("recipient", "fullName profilePic")
        .lean(),
    ]);

    res.status(200).json({ incomingReqs, acceptedReqs });
  } catch (error) {
    console.log("Error in getPendingFriendRequests controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getOutgoingFriendReqs(req, res) {
  try {
    const outgoingRequests = await FriendRequest.find({
      sender: req.user.id,
      status: "pending",
    }).populate("recipient", "fullName profilePic nativeLanguage learningLanguage")
      .lean();

    res.status(200).json(outgoingRequests);
  } catch (error) {
    console.log("Error in getOutgoingFriendReqs controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function streamNotifications(req, res) {
  const userId = req.user.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  subscribeNotificationStream(userId, res);

  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(`event: heartbeat\n`);
      res.write(`data: ${Date.now()}\n\n`);
    } catch {
      // socket likely closed; cleanup handled below
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribeNotificationStream(userId, res);
  });
}
