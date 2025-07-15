const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
// this is for the chatbot we are using google gemini bot 

require('dotenv').config();

console.log("Loaded API Key:", process.env.GEMINI_API_KEY?.slice(0, 10) + "...");

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

// Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Using Flash for higher rate limits

// Simple rate limiting - track requests per minute
const requestTracker = {
  count: 0,
  resetTime: Date.now() + 60000, // Reset every minute
  
  canMakeRequest() {
    const now = Date.now();
    if (now > this.resetTime) {
      this.count = 0;
      this.resetTime = now + 60000;
    }
    
    // Conservative limit: 10 requests per minute for free tier
    if (this.count >= 10) {
      return false;
    }
    
    this.count++;
    return true;
  }
};

// Retry logic for handling various errors
async function retryApiCall(apiCall, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      const isRetryableError = error.status === 503 || 
                              error.message?.includes('overloaded') ||
                              error.message?.includes('Service Unavailable');
      
      const isQuotaError = error.status === 429;
      
      if (isRetryableError && attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        console.log(`Attempt ${attempt + 1} failed with ${error.status || 'unknown'} error. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (isQuotaError && attempt < maxRetries - 1) {
        // For quota errors, wait longer based on retry delay from API
        const retryDelay = error.errorDetails?.find(detail => 
          detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
        )?.retryDelay;
        
        const delayMs = retryDelay ? parseInt(retryDelay) * 1000 : 30000; // Default 30 seconds
        console.log(`Quota exceeded. Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw error;
      }
    }
  }
}

app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check rate limit before making request
    if (!requestTracker.canMakeRequest()) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please wait before making another request.',
        retryAfter: 60000 - (Date.now() - (requestTracker.resetTime - 60000))
      });
    }

    // Create a system prompt and combine with user message
    const prompt = `You are a helpful AI assistant for customer support. Please respond to the following message: ${message}`;

    // Generate content with retry logic
    const result = await retryApiCall(async () => {
      return await model.generateContent(prompt);
    });

    const response = await result.response;
    const aiResponse = response.text();

    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Error in /chat:', error);
    
    // Handle specific API errors
    if (error.message?.includes('API key') || error.status === 401) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    if (error.message?.includes('quota') || error.status === 429) {
      return res.status(429).json({ 
        error: 'API quota exceeded. You have hit the daily or per-minute limit. Please try again later or upgrade your plan.',
        retryAfter: 60000, // Suggest retry after 1 minute
        details: 'Consider switching to Gemini 1.5 Flash for higher rate limits or upgrade to a paid plan'
      });
    }
    
    if (error.status === 503) {
      return res.status(503).json({ 
        error: 'Service temporarily unavailable due to high traffic. Please try again in a moment.',
        retryAfter: 5000 // Suggest retry after 5 seconds
      });
    }
    
    if (error.message?.includes('overloaded')) {
      return res.status(503).json({ 
        error: 'The AI model is currently overloaded. Please try again shortly.',
        retryAfter: 10000 // Suggest retry after 10 seconds
      });
    }
    
    // Generic error handling
    res.status(500).json({ 
      error: 'Failed to get AI response. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    model: 'gemini-1.5-pro',
    version: '1.0.0'
  });
});

// Test endpoint to verify API connectivity
app.get('/test-api', async (req, res) => {
  try {
    const testResult = await model.generateContent('Hello, this is a test message.');
    const testResponse = await testResult.response;
    res.json({ 
      status: 'API Working', 
      testResponse: testResponse.text().substring(0, 100) + '...' 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'API Error', 
      error: error.message 
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

app.listen(port, () => {
  console.log(`AI chatbot backend listening at http://localhost:${port}`);
  console.log(`Health check available at http://localhost:${port}/health`);
  console.log(`API test available at http://localhost:${port}/test-api`);
});