const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8000;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

// Configuration options
const SHOW_REASONING = process.env.SHOW_REASONING === false;
const ENABLE_THINKING_MODE = process.env.ENABLE_THINKING_MODE === false;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'NVIDIA NIM Proxy Server',
    endpoints: {
      chat: '/v1/chat/completions',
      models: '/v1/models'
    }
  });
});

// OpenAI-compatible models endpoint
app.get('/v1/models', async (req, res) => {
  try {
    const response = await axios.get(`${NVIDIA_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching models:', error.message);
    res.status(error.response?.status || 500).json({
      error: {
        message: error.message,
        type: 'nvidia_api_error'
      }
    });
  }
});

// OpenAI-compatible chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, stream, top_p } = req.body;

    // Build request body for NVIDIA NIM
    const nvidiaRequest = {
      model: model,
      messages: messages,
      temperature: temperature || 0.7,
      top_p: top_p || 1,
      max_tokens: max_tokens || 1024,
      stream: stream || false
    };

    console.log('Proxying request to NVIDIA NIM:', {
      model,
      messageCount: messages?.length
    });

    // Handle streaming
    if (stream) {
      const response = await axios.post(
        `${NVIDIA_BASE_URL}/chat/completions`,
        nvidiaRequest,
        {
          headers: {
            'Authorization': `Bearer ${NVIDIA_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
          },
          responseType: 'stream'
        }
      );

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      response.data.pipe(res);
    } else {
      // Non-streaming response
      const response = await axios.post(
        `${NVIDIA_BASE_URL}/chat/completions`,
        nvidiaRequest,
        {
          headers: {
            'Authorization': `Bearer ${NVIDIA_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      res.json(response.data);
    }
  } catch (error) {
    console.error('Error in chat completion:', error.message);
    
    const errorResponse = {
      error: {
        message: error.response?.data?.detail || error.message,
        type: 'nvidia_api_error',
        code: error.response?.status
      }
    };

    res.status(error.response?.status || 500).json(errorResponse);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      type: 'server_error'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`NVIDIA NIM Proxy server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
  if (!NVIDIA_API_KEY) {
    console.warn('WARNING: NVIDIA_API_KEY environment variable is not set!');
  }
});
