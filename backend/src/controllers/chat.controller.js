import { generateStreamToken, ensureStreamChannel } from "../lib/stream.js";
import Organization from "../models/Organization.js";

export async function getStreamToken(req, res) {
  try {
    if (!process.env.STREAM_API_KEY) {
      return res.status(500).json({ message: "STREAM_API_KEY is not configured" });
    }
    const token = generateStreamToken(req.user.id);
    res.status(200).json({ token, apiKey: process.env.STREAM_API_KEY || "" });
  } catch (error) {
    console.log("Error in getStreamToken controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

/**
 * POST /api/chat/ensure-channel
 * Body: { channelId }  e.g. "org-bizzcolab-inc-general"
 *
 * Uses the server-side admin Stream client to create the channel (if it
 * doesn't exist) and add the requesting user as a member.  This sidesteps
 * the client-side permission restriction on team-scoped channels.
 */
export async function ensureOrgChannel(req, res) {
  try {
    const { channelId } = req.body;
    if (!channelId) return res.status(400).json({ message: "channelId is required" });

    // req.user already loaded by middleware — skip redundant DB call
    if (!req.user?.organization) return res.status(403).json({ message: "Not in an organization" });

    const org = await Organization.findById(req.user.organization).select("slug channels").lean();
    if (!org) return res.status(404).json({ message: "Organization not found" });

    // Validate the channel belongs to this org
    const expectedPrefix = `org-${org.slug}-`;
    if (!channelId.startsWith(expectedPrefix)) {
      return res.status(403).json({ message: "Channel does not belong to your organization" });
    }

    const channelName = channelId.slice(expectedPrefix.length);
    const channelConfig = org.channels?.find((channel) => channel.name === channelName);
    if (!channelConfig) {
      return res.status(404).json({ message: "Channel not found" });
    }

    const canAccess = !channelConfig.isPrivate
      || ["admin", "owner"].includes(req.user.role)
      || channelConfig.members?.some((memberId) => memberId.toString() === req.user._id.toString());

    if (!canAccess) {
      return res.status(403).json({ message: "You do not have access to this channel" });
    }

    await ensureStreamChannel({
      channelId,
      channelName,
      orgSlug: org.slug,
      userId: req.user._id.toString(),
      memberIds: channelConfig.isPrivate ? (channelConfig.members || []).map((memberId) => memberId.toString()) : [],
      description: channelConfig.description || "",
      isPrivate: !!channelConfig.isPrivate,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error in ensureOrgChannel:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
