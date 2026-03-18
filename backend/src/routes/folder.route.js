import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getFolders, createFolder, deleteFolder } from "../controllers/folder.controller.js";

const router = express.Router();

router.get("/", protectRoute, getFolders);
router.post("/", protectRoute, createFolder);
router.delete("/:id", protectRoute, deleteFolder);

export default router;
