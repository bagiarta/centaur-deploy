const OpenAI = require('openai');
require('dotenv').config();

async function testGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  console.log("Testing Groq API Key...");
  const groq = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: "hi" }],
      model: "llama-3.3-70b-versatile",
    });
    console.log("SUCCESS:", completion.choices[0].message.content);
  } catch (err) {
    console.log("FAILED:", err.message);
    if (err.response) {
      console.log("HTTP Status:", err.status);
      console.log("Response Body:", JSON.stringify(err.response, null, 2));
    }
  }
}

testGroq();
