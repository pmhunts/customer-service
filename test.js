const { GoogleGenerativeAI } = require('@google/generative-ai');
require("dotenv").config();

// Check if API key is loaded
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY not found in environment variables");
  process.exit(1);
}

console.log("🔑 API Key loaded:", process.env.GEMINI_API_KEY.slice(0, 10) + "...");

const genAI = new GoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

(async () => {
  try {
    console.log("🚀 Testing Google Generative AI API connection...");

    const completion = await genAI.chat.completions.create({
      model: genAI.getGenerativeModel({ model: "gemini-1.5-flash" }), // Use gpt-3.5-turbo for free tier, gpt-4 for paid accounts
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello! Say hi and tell me what you can do." }
      ],
      max_tokens: 100,
      temperature: 0.7,
    });

    console.log("✅ API Test Successful!");
    console.log("📝 Response:", completion.choices[0].message.content);
    console.log("💰 Tokens used:", completion.usage.total_tokens);
    
  } 
  catch (error) {
    console.error("❌ API Test Failed:", error.message);
    if (error.code === 'invalid_api_key') {
      console.error("Please check your GEMINI_API_KEY in the .env file");
    } else if (error.code === 'insufficient_quota') {
      console.error("💳 Insufficient quota. Check your Google Generative AI account billing");
    } else if (error.code === 'model_not_found') {
      console.error("🤖 Model not found. Try 'gemini-1.5-flash' instead of 'gpt-4'");
    } else {
      console.error("📋 Full error:", error.message);
    }
  }
})();