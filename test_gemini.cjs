const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("Testing Gemini API Key...");
  const genAI = new GoogleGenerativeAI(apiKey);
  
  try {
    // Try flash-latest
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("hi");
    const response = await result.response;
    console.log("SUCCESS (flash):", response.text());
  } catch (err) {
    console.error("FAILED (flash):", err.message);
    
    try {
      console.log("Trying gemini-1.0-pro...");
      const model2 = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });
      const result2 = await model2.generateContent("hi");
      const response2 = await result2.response;
      console.log("SUCCESS (1.0-pro):", response2.text());
    } catch (err2) {
      console.error("FAILED (1.0-pro):", err2.message);
    }
  }
}

testGemini();
