import { StreamChat } from "stream-chat";
import "dotenv/config";

const apiKey = process.env.STREAM_API_KEY;
const apiSecret = process.env.STREAM_API_SECRET;

if (!apiKey || !apiSecret) {
  console.error("Stream API key or Secret is missing");
}

const streamClient = StreamChat.getInstance(apiKey, apiSecret);

export const upsertStreamUser = async (userData) => {
  try {
    // Stream expects 'teams' array for multi-tenancy
    const userToUpsert = {
      ...userData,
      ...(userData.teams ? { teams: userData.teams } : {}),
    };
    await streamClient.upsertUsers([userToUpsert]);
    return userToUpsert;
  } catch (error) {
    console.error("Error upserting Stream user:", error);
    throw error;
  }
};


export const generateStreamToken = (userId) => {
  try {
    // ensure userId is a string
    const userIdStr = userId.toString();
    return streamClient.createToken(userIdStr);
  } catch (error) {
    console.error("Error generating Stream token:", error);
    throw error;
  }
};

/**
 * Ensure a Stream team channel exists and the given user is a member.
 * Uses the server-side admin client so no client-side permission issues.
 */
export const ensureStreamChannel = async ({ channelId, channelName, orgSlug, userId, memberIds = [], description = "", isPrivate = false }) => {
  const uniqueMemberIds = [...new Set([userId, ...memberIds.map(String)])];
  const channel = streamClient.channel("team", channelId, {
    name: `#${channelName}`,
    description,
    team: orgSlug,
    created_by_id: userId,
    members: uniqueMemberIds,
    isPrivate,
  });

  try {
    await channel.create();
  } catch (error) {
    const code = error?.code || error?.response?.data?.code;
    if (code !== 4) throw error;
  }

  if (uniqueMemberIds.length) {
    try {
      await channel.addMembers(uniqueMemberIds);
    } catch (error) {
      const code = error?.code || error?.response?.data?.code;
      if (code !== 17) throw error;
    }
  }

  return channel;
};
