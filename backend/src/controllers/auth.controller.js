import { upsertStreamUser } from "../lib/stream.js";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import cloudinary from "../lib/cloudinary.js";

// 🧠 Helper function to create JWT
function createToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

const USER_CODE_REGEX = /^[A-Z0-9]{6}$/;
const CLOUDINARY_UPLOAD_TIMEOUT_MS = 60000;
const CLOUDINARY_UPLOAD_MAX_RETRIES = 1;

const normalizeUserCode = (value) => {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().toUpperCase();
  return normalized || "";
};

const ensureUniqueUserCode = async (candidate, excludeUserId = null) => {
  const query = { userCode: candidate };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  const existing = await User.findOne(query).select("_id").lean();
  return !existing;
};

const generateUserCode = async () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 25; i += 1) {
    let candidate = "";
    for (let j = 0; j < 6; j += 1) {
      candidate += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (await ensureUniqueUserCode(candidate)) return candidate;
  }
  throw new Error("Could not generate unique user code");
};

const isCloudinaryTimeoutError = (error) => {
  const cloudError = error?.error || {};
  const httpCode = Number(cloudError.http_code || error?.http_code || 0);
  const name = String(cloudError.name || error?.name || "").toLowerCase();
  const message = String(cloudError.message || error?.message || "").toLowerCase();
  return httpCode === 499 || name.includes("timeout") || message.includes("timeout");
};

const uploadProfilePicWithRetry = async (rawImageData) => {
  let lastError;
  for (let attempt = 0; attempt <= CLOUDINARY_UPLOAD_MAX_RETRIES; attempt += 1) {
    try {
      return await cloudinary.uploader.upload(rawImageData, {
        folder: "profile_pics",
        resource_type: "image",
        timeout: CLOUDINARY_UPLOAD_TIMEOUT_MS,
      });
    } catch (error) {
      lastError = error;
      if (!isCloudinaryTimeoutError(error) || attempt === CLOUDINARY_UPLOAD_MAX_RETRIES) {
        break;
      }
      console.warn(`Cloudinary upload timed out. Retrying (${attempt + 1}/${CLOUDINARY_UPLOAD_MAX_RETRIES})...`);
    }
  }
  throw lastError;
};

export async function signup(req, res) {
  const { email, password, fullName } = req.body;

  try {
    if (!email || !password || !fullName) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists, please use a different one" });
    }

    const newUser = await User.create({
      email,
      fullName,
      password,
      userCode: await generateUserCode(),
      profilePic: "", // intentionally empty — user sets a real photo during onboarding
    });

    try {
      await upsertStreamUser({
        id: newUser._id.toString(),
        name: newUser.fullName,
        image: "",
      });
      console.log(`✅ Stream user created for ${newUser.fullName}`);
    } catch (error) {
      console.log("⚠️ Error creating Stream user, rolling back MongoDB user:", error.message);
      await User.findByIdAndDelete(newUser._id);
      return res.status(500).json({ message: "Failed to create chat user. Please try again later." });
    }

    // ✅ FIXED: use process.env.JWT_SECRET instead of JWT_SECRET_KEY
    const token = createToken(newUser._id);

    res.cookie("jwt", token, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });

    res.status(201).json({ success: true, user: newUser });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.userCode) {
      return res.status(409).json({ message: "That User ID is already taken" });
    }
    console.log("Error in signup controller:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ email }).populate("organization");
    if (!user) return res.status(401).json({ message: "Invalid email or password" });

    const isPasswordCorrect = await user.matchPassword(password);
    if (!isPasswordCorrect) return res.status(401).json({ message: "Invalid email or password" });


    const token = createToken(user._id);

    // Keep Stream in sync on every login
    try {
      await upsertStreamUser({
        id: user._id.toString(),
        name: user.fullName,
        image: user.profilePic || "",
        ...(user.organization?.slug ? { teams: [user.organization.slug] } : {}),
      });
    } catch (streamError) {
      console.log("⚠️ Stream sync failed during login (non-fatal):", streamError.message);
    }

    res.cookie("jwt", token, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });

    res.status(200).json({ success: true, user });
  } catch (error) {
    console.log("Error in login controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export function logout(req, res) {
  res.clearCookie("jwt");
  res.status(200).json({ success: true, message: "Logout successful" });
}

export async function onboard(req, res) {
  try {
    const userId = req.user._id;
    const { fullName, bio, nativeLanguage, learningLanguage, location, userCode } = req.body;

    if (!fullName || !bio || !nativeLanguage || !learningLanguage || !location) {
      return res.status(400).json({
        message: "All fields are required",
        missingFields: [
          !fullName && "fullName",
          !bio && "bio",
          !nativeLanguage && "nativeLanguage",
          !learningLanguage && "learningLanguage",
          !location && "location",
        ].filter(Boolean),
      });
    }

    const normalizedUserCode = normalizeUserCode(userCode);
    if (normalizedUserCode !== undefined && normalizedUserCode !== "") {
      if (!USER_CODE_REGEX.test(normalizedUserCode)) {
        return res.status(400).json({ message: "User ID must be exactly 6 letters or digits" });
      }
      const isAvailable = await ensureUniqueUserCode(normalizedUserCode, userId);
      if (!isAvailable) {
        return res.status(409).json({ message: "That User ID is already taken" });
      }
    }
    let profilePicUrl = req.body.profilePic || "";

    // Upload to Cloudinary if it's a new base64 image
    if (req.body.profilePic?.startsWith("data:")) {
      try {
        const uploadResponse = await uploadProfilePicWithRetry(req.body.profilePic);
        profilePicUrl = uploadResponse.secure_url;
      } catch (uploadError) {
        console.error("Cloudinary upload error during onboarding:", uploadError);
        // Never store raw base64 in MongoDB — documents become huge and API
        // responses break for other users.  Fall back to empty (initials avatar).
        profilePicUrl = "";
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        fullName,
        bio,
        nativeLanguage,
        learningLanguage,
        location,
        profilePic: profilePicUrl,
        isOnboarded: true,
        ...(normalizedUserCode ? { userCode: normalizedUserCode } : {}),
      },
      { new: true, runValidators: true }
    ).populate("organization");


    if (!updatedUser) return res.status(404).json({ message: "User not found" });

    try {
      await upsertStreamUser({
        id: updatedUser._id.toString(),
        name: updatedUser.fullName,
        image: updatedUser.profilePic || "",
        ...(updatedUser.organization?.slug ? { teams: [updatedUser.organization.slug] } : {}),
      });

      console.log(`✅ Stream user updated for ${updatedUser.fullName}`);
    } catch (streamError) {
      console.log("⚠️ Error updating Stream user during onboarding:", streamError.message);
    }

    res.status(200).json({ success: true, user: updatedUser });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.userCode) {
      return res.status(409).json({ message: "That User ID is already taken" });
    }
    console.error("Onboarding error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function updateProfile(req, res) {
  try {
    const userId = req.user._id;
    const {
      fullName,
      bio,
      nativeLanguage,
      learningLanguage,
      location,
      profilePic,
      userCode,
      removeProfilePic,
    } = req.body;

    let profilePicUrl = profilePic;

    if (removeProfilePic === true) {
      profilePicUrl = "";
    } else if (profilePic?.startsWith("data:")) {
      try {
        const uploadResponse = await uploadProfilePicWithRetry(profilePic);
        profilePicUrl = uploadResponse.secure_url;
      } catch (uploadError) {
        console.error("Cloudinary upload error during profile update:", uploadError);
        if (isCloudinaryTimeoutError(uploadError)) {
          return res.status(504).json({ message: "Profile photo upload timed out. Please retry with a smaller image." });
        }
        return res.status(502).json({ message: "Profile photo upload failed. Please try again." });
      }
    }

    const normalizedUserCode = normalizeUserCode(userCode);
    if (normalizedUserCode !== undefined) {
      if (normalizedUserCode === "") {
        return res.status(400).json({ message: "User ID cannot be empty" });
      }
      if (!USER_CODE_REGEX.test(normalizedUserCode)) {
        return res.status(400).json({ message: "User ID must be exactly 6 letters or digits" });
      }
      const isAvailable = await ensureUniqueUserCode(normalizedUserCode, userId);
      if (!isAvailable) {
        return res.status(409).json({ message: "That User ID is already taken" });
      }
    }

    // Build update object — omit profilePic entirely if upload failed or no new
    // image was provided (keeps existing Cloudinary URL in the database).
    const updateFields = {};
    if (fullName !== undefined) updateFields.fullName = fullName;
    if (bio !== undefined) updateFields.bio = bio;
    if (nativeLanguage !== undefined) updateFields.nativeLanguage = nativeLanguage;
    if (learningLanguage !== undefined) updateFields.learningLanguage = learningLanguage;
    if (location !== undefined) updateFields.location = location;
    if (removeProfilePic === true) {
      updateFields.profilePic = "";
    } else if (profilePicUrl !== undefined && profilePicUrl !== "") {
      updateFields.profilePic = profilePicUrl;
    }
    if (normalizedUserCode !== undefined) {
      updateFields.userCode = normalizedUserCode;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true, runValidators: true }
    ).select("-password").populate("organization");



    if (!updatedUser) return res.status(404).json({ message: "User not found" });

    // Keep Stream in sync
    try {
      await upsertStreamUser({
        id: updatedUser._id.toString(),
        name: updatedUser.fullName,
        image: updatedUser.profilePic || "",
        ...(updatedUser.organization?.slug ? { teams: [updatedUser.organization.slug] } : {}),
      });

    } catch (e) {
      console.log("⚠️ Stream sync failed during profile update:", e.message);
    }

    res.status(200).json({ success: true, user: updatedUser });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.userCode) {
      return res.status(409).json({ message: "That User ID is already taken" });
    }
    console.error("updateProfile error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

