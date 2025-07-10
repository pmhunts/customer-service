const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');

require('dotenv').config();

console.log("Loaded API Key:", process.env.GEMINI_API_KEY?.slice(0, 10) + "...");

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

// Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Create a system prompt and combine with user message
    const prompt = `You are a helpful AI assistant for customer support. Please respond to the following message: ${message}`;

    // Generate content
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiResponse = response.text();

    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Error in /chat:', error);
    
    // Handle specific API errors
    if (error.message?.includes('API key')) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    if (error.message?.includes('quota')) {
      return res.status(429).json({ error: 'API quota exceeded' });
    }
    
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`AI chatbot backend listening at http://localhost:${port}`);
});