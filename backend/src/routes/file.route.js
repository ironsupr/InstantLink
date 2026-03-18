import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getFiles, uploadFile, deleteFile, moveFile, proxyImage } from "../controllers/file.controller.js";

const router = express.Router();

router.get("/image-proxy", proxyImage);
router.get("/", protectRoute, getFiles);
router.post("/upload", protectRoute, uploadFile);
router.patch("/:id/move", protectRoute, moveFile);
router.delete("/:id", protectRoute, deleteFile);

export default router;
