import Transcript from "../models/Transcript.js";
import cloudinary from "../lib/cloudinary.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

const SUMMARY_FALLBACK_PREFIX = "Summary (fallback)";

const sanitizeTranscriptText = (text) =>
  String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^Transcript for Call:/i.test(line))
    .join("\n");

const buildTranscriptTextFromEntries = (entries = []) =>
  [...entries]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map((entry) => `${entry.speakerName}: ${entry.text}`)
    .join("\n");

const splitTranscriptIntoChunks = (transcriptText, maxChars = 12000) => {
  const lines = sanitizeTranscriptText(transcriptText).split("\n").filter(Boolean);
  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;

  for (const line of lines) {
    const nextLength = currentLength + line.length + 1;
    if (currentChunk.length > 0 && nextLength > maxChars) {
      chunks.push(currentChunk.join("\n"));
      currentChunk = [line];
      currentLength = line.length;
      continue;
    }

    currentChunk.push(line);
    currentLength = nextLength;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n"));
  }

  return chunks.filter(Boolean);
};

const extractGeminiText = (result) => {
  const direct = result?.response?.text?.();
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const parts = result?.response?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
};

const generateChunkPrompt = (chunkText, chunkIndex, totalChunks) => `You are summarizing chunk ${chunkIndex} of ${totalChunks} from a meeting transcript.
Return concise notes with these exact sections:
- Key topics
- Decisions
- Action items
- Risks / blockers
- Open questions

Rules:
- Use only facts explicitly stated in the transcript.
- Merge duplicate points.
- Keep bullets short and concrete.
- If a section has no information, write "- None noted".

Transcript chunk:
${chunkText}`;

const generateFinalSummaryPrompt = (combinedNotes) => `You are an expert meeting assistant.
Using the chunk notes below, produce a clean final summary in plain text with these exact sections:

Executive Summary
Write 2-4 sentences summarizing the meeting outcome.

Key Topics
- bullet list

Decisions
- bullet list

Action Items
- Owner - task - due date if stated

Risks / Blockers
- bullet list

Open Questions
- bullet list

Rules:
- Use only information present in the notes.
- De-duplicate repeated items.
- Prefer concrete statements over generic wording.
- If a section has no content, write "- None noted".

Chunk notes:
${combinedNotes}`;

const generateSinglePassSummaryPrompt = (transcriptText) => `You are an expert meeting assistant.
Read this transcript and produce a high-quality plain-text summary with these exact sections:

Executive Summary
Write 2-4 sentences summarizing the purpose, discussion, and outcome.

Key Topics
- bullet list of the main topics discussed

Decisions
- bullet list of decisions that were actually made

Action Items
- Owner - task - due date if stated

Risks / Blockers
- bullet list

Open Questions
- bullet list

Rules:
- Use only facts explicitly stated in the transcript.
- Do not invent owners, deadlines, or decisions.
- Merge duplicates and remove filler.
- Prefer concise, specific wording.
- If a section has no information, write "- None noted".

Transcript:
${transcriptText}`;

const generateAiSummary = async ({ apiKey, modelName, transcriptText }) => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const chunks = splitTranscriptIntoChunks(transcriptText);

  if (chunks.length <= 1) {
    const result = await model.generateContent(generateSinglePassSummaryPrompt(chunks[0] || transcriptText));
    return extractGeminiText(result);
  }

  const chunkSummaries = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const result = await model.generateContent(generateChunkPrompt(chunks[index], index + 1, chunks.length));
    const chunkSummary = extractGeminiText(result);
    if (chunkSummary) {
      chunkSummaries.push(`Chunk ${index + 1}\n${chunkSummary}`);
    }
  }

  const finalResult = await model.generateContent(generateFinalSummaryPrompt(chunkSummaries.join("\n\n")));
  return extractGeminiText(finalResult);
};

const buildFallbackSummary = (transcriptText) => {
  const lines = sanitizeTranscriptText(transcriptText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const speakerCounts = new Map();
  const statements = [];

  for (const line of lines) {
    const match = line.match(/^(?:\[[^\]]+\]\s*)?([^:]{1,80}):\s*(.+)$/);
    if (!match) continue;
    const speaker = match[1].trim();
    const text = match[2].trim();
    if (!text) continue;
    speakerCounts.set(speaker, (speakerCounts.get(speaker) || 0) + 1);
    statements.push({ speaker, text });
  }

  const topSpeakers = Array.from(speakerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => `${name} (${count} turns)`);

  const decisions = statements
    .filter((s) => /\b(decide|decision|agreed|approved|finalized|confirmed|we will)\b/i.test(s.text))
    .slice(0, 5)
    .map((s) => `- ${s.speaker}: ${s.text}`);

  const actions = statements
    .filter((s) => /\b(action item|todo|follow up|next step|need to|will do|owner|deadline|due)\b/i.test(s.text))
    .slice(0, 5)
    .map((s) => `- ${s.speaker}: ${s.text}`);

  const blockers = statements
    .filter((s) => /\b(blocker|risk|issue|problem|concern|stuck|waiting on|dependency)\b/i.test(s.text))
    .slice(0, 5)
    .map((s) => `- ${s.speaker}: ${s.text}`);

  const openQuestions = statements
    .filter((s) => /\?|\b(question|unclear|not sure|need to confirm|need clarity)\b/i.test(s.text))
    .slice(0, 5)
    .map((s) => `- ${s.speaker}: ${s.text}`);

  const highlights = statements
    .filter((s) => s.text.length >= 24)
    .slice(0, 6)
    .map((s) => `- ${s.speaker}: ${s.text}`);

  const executiveSummary = [
    `This meeting captured ${statements.length || 0} transcript statements across ${speakerCounts.size || 0} participant${speakerCounts.size === 1 ? "" : "s"}.`,
    decisions.length > 0
      ? `At least ${decisions.length} decision${decisions.length === 1 ? " was" : "s were"} identified.`
      : "No explicit decisions were clearly identified.",
    actions.length > 0
      ? `There ${actions.length === 1 ? "was 1 clear action item" : `were ${actions.length} clear action items`} mentioned.`
      : "No clear action items were explicitly stated.",
  ].join(" ");

  return [
    SUMMARY_FALLBACK_PREFIX,
    "",
    "Executive Summary",
    executiveSummary,
    "",
    "Key Topics",
    ...(highlights.length ? highlights : ["- None noted"]),
    "",
    "Decisions",
    ...(decisions.length ? decisions : ["- None noted"]),
    "",
    "Action Items",
    ...(actions.length ? actions : ["- None noted"]),
    "",
    "Risks / Blockers",
    ...(blockers.length ? blockers : ["- None noted"]),
    "",
    "Open Questions",
    ...(openQuestions.length ? openQuestions : ["- None noted"]),
    "",
    `Participants observed: ${topSpeakers.length ? topSpeakers.join(", ") : "Unknown"}`,
  ].join("\n");
};

/**
 * POST /api/transcripts/:callId/entries
 * Each participant pushes their own speech segments.
 * Entries are deduplicated by entryId.
 */
export const addTranscriptEntries = async (req, res) => {
  try {
    const { callId } = req.params;
    const { entries } = req.body;
    const speakerId = req.user._id;

    if (!callId || typeof callId !== "string" || callId.length > 200) {
      return res.status(400).json({ message: "Invalid callId" });
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ message: "No entries provided" });
    }

    // Sanitise and validate entries
    const sanitised = entries.filter(
      (e) =>
        e?.entryId &&
        typeof e.entryId === "string" &&
        typeof e.text === "string" &&
        e.text.trim().length > 0 &&
        e.timestamp
    ).map((e) => ({
      entryId: e.entryId.slice(0, 100),
      speakerId,
      speakerName: typeof e.speakerName === "string" ? e.speakerName.slice(0, 120) : "Unknown",
      text: e.text.trim().slice(0, 2000),
      timestamp: new Date(e.timestamp),
    }));

    if (sanitised.length === 0) {
      return res.status(400).json({ message: "No valid entries provided" });
    }

    const existing = await Transcript.findOne({ callId });

    if (existing) {
      const existingIds = new Set(existing.entries.map((e) => e.entryId));
      const newEntries = sanitised.filter((e) => !existingIds.has(e.entryId));

      const updateDoc = {
        $addToSet: { participants: speakerId },
      };
      if (newEntries.length > 0) {
        updateDoc.$push = { entries: { $each: newEntries } };
        updateDoc.$unset = { cloudinaryUrl: "" };
      }

      await Transcript.updateOne({ callId }, updateDoc);
    } else {
      await Transcript.create({
        callId,
        participants: [speakerId],
        entries: sanitised,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error saving transcript entries:", error);
    res.status(500).json({ message: "Failed to save transcript" });
  }
};

/**
 * GET /api/transcripts/:callId
 * Returns the transcript for a call, sorted chronologically.
 */
export const getTranscript = async (req, res) => {
  try {
    const { callId } = req.params;

    if (!callId || typeof callId !== "string" || callId.length > 200) {
      return res.status(400).json({ message: "Invalid callId" });
    }

    const transcript = await Transcript.findOne({ callId }).lean();

    if (!transcript) {
      return res.status(404).json({ message: "Transcript not found" });
    }

    if (transcript.cloudinaryUrl) {
      const url = transcript.cloudinaryUrl.includes('fl_attachment') 
        ? transcript.cloudinaryUrl 
        : transcript.cloudinaryUrl.replace('/upload/', '/upload/fl_attachment/');
      return res.json({ cloudinaryUrl: url });
    }

    if (!transcript.entries || transcript.entries.length === 0) {
      return res.status(404).json({ message: "No transcript entries found" });
    }

    // Generate .txt file on the fly and upload to Cloudinary
    transcript.entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const lines = transcript.entries.map((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `[${time}] ${entry.speakerName}: ${entry.text}`;
    });

    const header = `Transcript for Call: ${callId}\n\n`;
    const textContent = header + lines.join("\n");

    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: "raw", folder: "transcripts", format: "txt", public_id: `transcript_${callId}` },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(Buffer.from(textContent));
    });

    const finalUrl = uploadResult.secure_url.includes('fl_attachment')
      ? uploadResult.secure_url
      : uploadResult.secure_url.replace('/upload/', '/upload/fl_attachment/');

    await Transcript.updateOne({ _id: transcript._id }, { cloudinaryUrl: finalUrl });

    res.json({ cloudinaryUrl: finalUrl });
  } catch (error) {
    console.error("Error fetching transcript:", error);
    res.status(500).json({ message: "Failed to fetch transcript" });
  }
};

/**
 * GET /api/transcripts/:callId/summary
 * Generates an AI summary of the transcript and caches it.
 */
export const getTranscriptSummary = async (req, res) => {
  try {
    const { callId } = req.params;

    if (!callId || typeof callId !== "string" || callId.length > 200) {
      return res.status(400).json({ message: "Invalid callId" });
    }

    const transcript = await Transcript.findOne({ callId });

    if (!transcript) {
      return res.status(404).json({ message: "Transcript not found" });
    }

    const isFallbackSummary = typeof transcript.summary === "string" && transcript.summary.startsWith(SUMMARY_FALLBACK_PREFIX);

    // Return cached AI summary if available. Allow fallback summaries to be regenerated.
    if (transcript.summary && !isFallbackSummary) {
      return res.json({ summary: transcript.summary });
    }

    // Check if we have the transcript text
    let transcriptText = "";

    // Prefer structured entries for better summary quality.
    if (transcript.entries && transcript.entries.length > 0) {
      transcriptText = buildTranscriptTextFromEntries(transcript.entries);
    } else if (transcript.cloudinaryUrl) {
      try {
        // Fetch raw text from Cloudinary
        const rawUrl = transcript.cloudinaryUrl.replace('/upload/fl_attachment/', '/upload/');
        const response = await axios.get(rawUrl);
        transcriptText = sanitizeTranscriptText(response.data);
      } catch (err) {
        console.error("Error fetching transcript from Cloudinary for summary:", err);
        return res.status(500).json({ message: "Failed to fetch transcript content" });
      }
    } else {
      return res.status(404).json({ message: "No transcript content available to summarize" });
    }

    const configuredModel = (process.env.GEMINI_MODEL || "").trim();

    // Keep prompt within practical limits to avoid model input/token errors on long calls.
    const MAX_TRANSCRIPT_CHARS = 25000;
    const safeTranscriptText =
      transcriptText.length > MAX_TRANSCRIPT_CHARS
        ? `${transcriptText.slice(0, MAX_TRANSCRIPT_CHARS)}\n\n[Transcript truncated for summary length limits]`
        : transcriptText;

    const prompt = `You are an AI meeting assistant. Read the transcript and produce a concise summary with these sections:\n1) Key topics\n2) Decisions\n3) Action items (owner + task + deadline if stated)\n4) Risks or blockers\n\nIf a section has no information, write "None noted".\n\nTranscript:\n${safeTranscriptText}`;

    let summaryText = "";
    let warning = "";

    if (!process.env.GEMINI_API_KEY || !configuredModel) {
      summaryText = buildFallbackSummary(safeTranscriptText);
      warning = "AI summary is not fully configured. Returned fallback summary.";
    } else {
      try {
        summaryText = await generateAiSummary({
          apiKey: process.env.GEMINI_API_KEY,
          modelName: configuredModel,
          transcriptText: safeTranscriptText,
        });

        if (!summaryText) {
          throw new Error(`No summary text was returned by Gemini model: ${configuredModel}`);
        }
      } catch (geminiError) {
        const status = geminiError?.status || geminiError?.response?.status;
        console.error("Gemini summary failed, using fallback summary:", geminiError?.message || geminiError);
        summaryText = buildFallbackSummary(safeTranscriptText);
        warning = status === 429
          ? "Gemini quota exceeded. Returned fallback summary."
          : "Gemini summary failed. Returned fallback summary.";
      }
    }

    // Cache AI summaries. Keep fallback summaries uncached so a future request can retry Gemini.
    if (!warning) {
      transcript.summary = summaryText;
      await transcript.save();
    }

    res.json({ summary: summaryText, ...(warning ? { warning } : {}) });
  } catch (error) {
    console.error("Error generating summary:", error);
    res.status(500).json({
      message: error?.message || "Failed to generate meeting summary",
    });
  }
};
