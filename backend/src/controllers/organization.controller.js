import Organization from "../models/Organization.js";
import User from "../models/User.js";
import { ensureStreamChannel, upsertStreamUser } from "../lib/stream.js";
import cloudinary from "../lib/cloudinary.js";

const canAccessChannel = (channel, userId, role) => {
    if (!channel) return false;
    if (!channel.isPrivate) return true;
    if (["admin", "owner"].includes(role)) return true;
    return (channel.members || []).some((memberId) => memberId.toString() === userId.toString());
};

const serializeVisibleChannels = (channels = [], userId, role) => (
    channels.filter((channel) => canAccessChannel(channel, userId, role))
);


/* ─────────────────────────────────────────
   POST /api/organizations/create
   Body: { name, description? }
   Creates a new org; caller becomes owner
──────────────────────────────────────────── */
export async function createOrganization(req, res) {
    try {
        const { name, description = "" } = req.body;
        if (!name?.trim()) return res.status(400).json({ message: "Organization name is required" });

        // req.user is already loaded by middleware — no need to re-fetch
        if (req.user.organization) {
            return res.status(400).json({ message: "You are already part of an organization" });
        }

        // Build a URL-safe slug from the name
        const baseSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

        // Guarantee slug uniqueness by appending a random suffix if needed
        let slug = baseSlug;
        let exists = await Organization.findOne({ slug });
        if (exists) slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

        // Guarantee inviteCode uniqueness
        let inviteCode;
        let isUnique = false;
        while (!isUnique) {
            inviteCode = Organization.generateInviteCode();
            const codeExists = await Organization.findOne({ inviteCode });
            if (!codeExists) isUnique = true;
        }

        const org = await Organization.create({
            name: name.trim(),
            slug,
            description,
            inviteCode,
            owner: req.user._id,
            admins: [req.user._id],
        });

        // Link the user to this organization and make them owner
        const updatedUser = await User.findByIdAndUpdate(req.user._id, {
            organization: org._id,
            role: "owner",
        }, { new: true });

        // Sync with Stream Chat - Grant access to the org's team
        try {
            await upsertStreamUser({
                id: updatedUser._id.toString(),
                name: updatedUser.fullName,
                image: updatedUser.profilePic || "",
                teams: [org.slug], // Set the team slug for multi-tenancy
            });
            console.log(`✅ Stream user synced for ${updatedUser.fullName} in team ${org.slug}`);
        } catch (streamError) {
            console.error("⚠️ Stream sync error on org create:", streamError.message);
        }


        res.status(201).json({ success: true, organization: org });
    } catch (error) {
        console.error("Error in createOrganization:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

/* ─────────────────────────────────────────
   POST /api/organizations/join
   Body: { inviteCode }
──────────────────────────────────────────── */
export async function joinOrganization(req, res) {
    try {
        const { inviteCode } = req.body;
        if (!inviteCode?.trim()) return res.status(400).json({ message: "Invite code is required" });

        const org = await Organization.findOne({ inviteCode: inviteCode.trim().toUpperCase() }).lean();
        if (!org) return res.status(404).json({ message: "Invalid invite code" });

        // req.user already loaded by middleware — no need for another DB call
        if (req.user.organization) {
            if (req.user.organization.toString() === org._id.toString()) {
                return res.status(400).json({ message: "You are already a member of this organization" });
            }
            return res.status(400).json({ message: "You are already part of another organization" });
        }

        // Add user to org
        const updatedUser = await User.findByIdAndUpdate(req.user._id, {
            organization: org._id,
            role: "member",
        }, { new: true });

        // Sync with Stream Chat
        try {
            await upsertStreamUser({
                id: updatedUser._id.toString(),
                name: updatedUser.fullName,
                image: updatedUser.profilePic || "",
                teams: [org.slug],
            });
            console.log(`✅ Stream user synced for ${updatedUser.fullName} in team ${org.slug}`);
        } catch (streamError) {
            console.error("⚠️ Stream sync error on org join:", streamError.message);
        }

        // Return org data (without sensitive invite code for members)
        const orgData = { ...org };
        delete orgData.inviteCode;

        res.status(200).json({ success: true, organization: orgData });
    } catch (error) {
        console.error("Error in joinOrganization:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

/* ─────────────────────────────────────────
   GET /api/organizations/me
   Returns the current user's organization
──────────────────────────────────────────── */
export async function getMyOrganization(req, res) {
    try {
        // req.user already has organization + role from middleware
        if (!req.user?.organization) {
            return res.status(200).json({ organization: null });
        }

        // Run org fetch + member count in parallel
        const [org, memberCount] = await Promise.all([
            Organization.findById(req.user.organization)
                .populate("owner", "fullName profilePic")
                .lean(),
            User.countDocuments({ organization: req.user.organization }),
        ]);
        if (!org) return res.status(404).json({ message: "Organization not found" });

        // Only owners/admins see the invite code
        const isAdminOrOwner = org.admins.some((a) => a.toString() === req.user._id.toString());
        if (!isAdminOrOwner) delete org.inviteCode;
        org.channels = serializeVisibleChannels(org.channels, req.user._id, req.user.role);
        org.memberCount = memberCount;

        res.status(200).json({ success: true, organization: org, role: req.user.role });
    } catch (error) {
        console.error("Error in getMyOrganization:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

/* ─────────────────────────────────────────
   POST /api/organizations/regenerate-code
   Admin/Owner regenerates invite code
──────────────────────────────────────────── */
export async function regenerateInviteCode(req, res) {
    try {
        // req.user already has organization + role from middleware
        if (!req.user?.organization) return res.status(404).json({ message: "You are not in an organization" });
        if (!["admin", "owner"].includes(req.user.role)) return res.status(403).json({ message: "Admins only" });

        const newCode = Organization.generateInviteCode();
        const org = await Organization.findByIdAndUpdate(
            req.user.organization,
            { inviteCode: newCode },
            { new: true }
        ).lean();

        res.status(200).json({ success: true, inviteCode: org.inviteCode });
    } catch (error) {
        console.error("Error in regenerateInviteCode:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

/* ─────────────────────────────────────────
   PUT /api/organizations/settings
   Admin updates organization display settings
──────────────────────────────────────────── */
export async function updateOrganizationSettings(req, res) {
    try {
        if (!req.user?.organization) return res.status(404).json({ message: "You are not in an organization" });
        if (!["admin", "owner"].includes(req.user.role)) return res.status(403).json({ message: "Admins only" });

        const { name, description = "", website = "", logo } = req.body;

        if (!name?.trim()) {
            return res.status(400).json({ message: "Organization name is required" });
        }

        let logoUrl = logo;
        if (logo?.startsWith("data:")) {
            try {
                const uploadResponse = await cloudinary.uploader.upload(logo, {
                    folder: "organization_logos",
                });
                logoUrl = uploadResponse.secure_url;
            } catch (uploadError) {
                console.error("Cloudinary upload error during organization update:", uploadError);
                logoUrl = undefined;
            }
        }

        const normalizedWebsite = website.trim();
        if (normalizedWebsite && !/^https?:\/\//i.test(normalizedWebsite)) {
            return res.status(400).json({ message: "Website must start with http:// or https://" });
        }

        const updateFields = {
            name: name.trim(),
            description: description.trim(),
            website: normalizedWebsite,
        };

        if (logoUrl !== undefined) updateFields.logo = logoUrl;

        const organization = await Organization.findByIdAndUpdate(
            req.user.organization,
            updateFields,
            { new: true, runValidators: true }
        )
            .populate("owner", "fullName profilePic")
            .lean();

        if (!organization) return res.status(404).json({ message: "Organization not found" });

        const memberCount = await User.countDocuments({ organization: req.user.organization });
        const isAdminOrOwner = organization.admins.some((a) => a.toString() === req.user._id.toString());
        if (!isAdminOrOwner) delete organization.inviteCode;
        organization.channels = serializeVisibleChannels(organization.channels, req.user._id, req.user.role);
        organization.memberCount = memberCount;

        res.status(200).json({ success: true, organization });
    } catch (error) {
        console.error("Error in updateOrganizationSettings:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

/* ─────────────────────────────────────────
   POST /api/organizations/channels
   Admin adds a new channel
──────────────────────────────────────────── */
export async function createChannel(req, res) {
    try {
        // req.user already has organization + role from middleware
        if (!req.user?.organization) return res.status(400).json({ message: "You are not in an organization" });
        if (!["admin", "owner"].includes(req.user.role)) return res.status(403).json({ message: "Admins only" });

        const { name, description = "", memberIds = [] } = req.body;
        if (!name?.trim()) return res.status(400).json({ message: "Channel name is required" });

        const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-");
        const uniqueMemberIds = [...new Set((Array.isArray(memberIds) ? memberIds : []).map(String))];
        const isPrivate = uniqueMemberIds.length > 0;

        const org = await Organization.findById(req.user.organization);
        if (!org) return res.status(404).json({ message: "Organization not found" });
        const exists = org.channels.some((c) => c.name === cleanName);
        if (exists) return res.status(400).json({ message: "A channel with that name already exists" });

        if (uniqueMemberIds.length > 0) {
            const validMembers = await User.find({
                _id: { $in: uniqueMemberIds },
                organization: req.user.organization,
                isOnboarded: true,
            }).select("_id").lean();

            if (validMembers.length !== uniqueMemberIds.length) {
                return res.status(400).json({ message: "Some selected members are invalid for this organization" });
            }
        }

        const channelMemberIds = isPrivate
            ? [...new Set([req.user._id.toString(), ...uniqueMemberIds])]
            : [];

        org.channels.push({
            name: cleanName,
            description,
            isPrivate,
            members: channelMemberIds,
            isDefault: false,
        });
        await org.save();

        const channelId = `org-${org.slug}-${cleanName}`;
        await ensureStreamChannel({
            channelId,
            channelName: cleanName,
            orgSlug: org.slug,
            userId: req.user._id.toString(),
            memberIds: channelMemberIds,
            description,
            isPrivate,
        });

        res.status(201).json({
            success: true,
            channels: serializeVisibleChannels(org.channels, req.user._id, req.user.role),
        });
    } catch (error) {
        console.error("Error in createChannel:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

/* ─────────────────────────────────────────
   DELETE /api/organizations/channels/:channelId
   Admin deletes a custom channel
──────────────────────────────────────────── */
export async function deleteChannel(req, res) {
    try {
        // req.user already has organization + role from middleware
        if (!req.user?.organization) return res.status(400).json({ message: "Not in an organization" });
        if (!["admin", "owner"].includes(req.user.role)) return res.status(403).json({ message: "Admins only" });

        const org = await Organization.findById(req.user.organization);
        const channel = org.channels.id(req.params.channelId);
        if (!channel) return res.status(404).json({ message: "Channel not found" });
        if (channel.isDefault) return res.status(400).json({ message: "Cannot delete default channels" });

        channel.deleteOne();
        await org.save();

        res.status(200).json({ success: true, channels: org.channels });
    } catch (error) {
        console.error("Error in deleteChannel:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

/* ─────────────────────────────────────────
   GET /api/organizations/members
   List all members of the org
──────────────────────────────────────────── */
export async function getOrgMembers(req, res) {
    try {
        // req.user already has organization from middleware
        if (!req.user?.organization) return res.status(400).json({ message: "Not in an organization" });

        const members = await User.find({ organization: req.user.organization, isOnboarded: true })
            .select("fullName profilePic nativeLanguage learningLanguage location role bio")
            .lean();

        res.status(200).json({ success: true, members });
    } catch (error) {
        console.error("Error in getOrgMembers:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
