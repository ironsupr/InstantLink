import express from "express";
import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import compression from "compression";
import path from "path";

import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import chatRoutes from "./routes/chat.route.js";
import organizationRoutes from "./routes/organization.route.js";
import fileRoutes from "./routes/file.route.js";
import meetingRoutes from "./routes/meeting.route.js";
import folderRoutes from "./routes/folder.route.js";
import transcriptRoutes from "./routes/transcript.route.js";
import callLogRoutes from "./routes/callLog.route.js";
import internalRoutes from "./routes/internal.route.js";




import { connectDB } from "./lib/db.js";
import { initScheduler } from "./lib/scheduler.js";

const app = express();
const PORT = process.env.PORT || 5000;
let initPromise;
let schedulerInitialized = false;

const __dirname = path.resolve();
const configuredOrigins = [process.env.CLIENT_URL, process.env.FRONTEND_URL].filter(Boolean);

const isVercelPreviewOrigin = (origin) => {
  try {
    const { hostname } = new URL(origin);
    return hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
};

export const initializeServer = async ({ enableScheduler = false } = {}) => {
  if (!initPromise) {
    initPromise = connectDB().catch((error) => {
      initPromise = undefined;
      throw error;
    });
  }

  await initPromise;

  if (enableScheduler && !schedulerInitialized) {
    await initScheduler();
    schedulerInitialized = true;
  }
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (configuredOrigins.length === 0) {
        return callback(null, true);
      }

      if (configuredOrigins.includes(origin) || isVercelPreviewOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true, // allow frontend to send cookies
  })
);

// Compress all responses except SSE streams (compression buffers chunks and
// can delay realtime delivery).
app.use(
  compression({
    filter: (req, res) => {
      if (req.path === "/api/users/stream" || req.headers.accept === "text/event-stream") {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

app.use(express.json({ limit: "25mb" }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/transcripts", transcriptRoutes);
app.use("/api/call-logs", callLogRoutes);
app.use("/api/internal", internalRoutes);




if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}

if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
  // Connect to MongoDB BEFORE accepting requests
  initializeServer({ enableScheduler: true })
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error("Failed to initialize server", error);
    });
}

export default app;
