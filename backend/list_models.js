import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
async function listModels() {
  try {
    const models = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`).then(res => res.json());
    console.log("Available models:");
    models.models.forEach(m => console.log(m.name));
  } catch (e) {
    console.error(e);
  }
}
listModels();
