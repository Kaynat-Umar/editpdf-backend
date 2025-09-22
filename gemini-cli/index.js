#!/usr/bin/env node
import { GoogleGenerativeAI } from "@google/generative-ai";

// join all args as the prompt
const prompt = process.argv.slice(2).join(" ");
if (!prompt) {
  console.log("Usage: gemini <your prompt>");
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ GEMINI_API_KEY not set.");
  console.error('👉 Set it in PowerShell with: setx GEMINI_API_KEY "your_api_key_here"');
  process.exit(1);
}

// Create Gemini client
const genAI = new GoogleGenerativeAI(apiKey);

(async () => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);

    if (result && result.response && typeof result.response.text === "function") {
      console.log(result.response.text());
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error("Error:", err?.message ?? err);
    process.exit(1);
  }
})();
