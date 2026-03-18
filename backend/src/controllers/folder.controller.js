import Folder from "../models/Folder.js";
import File from "../models/File.js";

export const getFolders = async (req, res) => {
  try {
    const organizationId = req.user.organization;
    if (!organizationId)
      return res.status(400).json({ message: "User does not belong to an organization" });

    const folders = await Folder.find({ organization: organizationId })
      .populate("createdBy", "fullName profilePic")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(folders);
  } catch (error) {
    console.error("Error in getFolders:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const createFolder = async (req, res) => {
  try {
    const { name } = req.body;
    const organizationId = req.user.organization;

    if (!organizationId)
      return res.status(400).json({ message: "User does not belong to an organization" });

    if (!name || !name.trim())
      return res.status(400).json({ message: "Folder name is required" });

    const existing = await Folder.findOne({ name: name.trim(), organization: organizationId });
    if (existing)
      return res.status(409).json({ message: "A folder with that name already exists" });

    const folder = await Folder.create({
      name: name.trim(),
      organization: organizationId,
      createdBy: req.user._id,
    });

    await folder.populate("createdBy", "fullName profilePic");
    res.status(201).json(folder);
  } catch (error) {
    console.error("Error in createFolder:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const folder = await Folder.findById(id);

    if (!folder) return res.status(404).json({ message: "Folder not found" });

    const isOwnerOrAdmin = ["admin", "owner"].includes(req.user.role);
    if (folder.createdBy.toString() !== req.user._id.toString() && !isOwnerOrAdmin)
      return res.status(403).json({ message: "Unauthorized" });

    // Move files out of the deleted folder (un-assign them)
    await File.updateMany({ folder: id }, { $unset: { folder: "" } });

    await Folder.findByIdAndDelete(id);
    res.status(200).json({ message: "Folder deleted" });
  } catch (error) {
    console.error("Error in deleteFolder:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
