const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8000;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

const SHOW_REASONING = process.env.SHOW_REASONING === 'true' || false;
const ENABLE_THINKING_MODE = process.env.ENABLE_THINKING_MODE === 'true' || false;

const MODEL_MAPPING = {
  'gpt-3.5-turbo': 'meta/llama-3.1-8b-instruct',
  'gpt-4': 'meta/llama-3.1-70b-instruct',
  'gpt-4-turbo': 'nvidia/llama-3.1-nemotron-70b-instruct',
  'llama-8b': 'meta/llama-3.1-8b-instruct',
  'llama-70b': 'meta/llama-3.1-70b-instruct',
  'deepseek': 'deepseek-ai/deepseek-v3_2',
  'yi': '01-ai/yi-large',
  'nemotron': 'nvidia/llama-3.1-nemotron-70b-instruct',
  'glm': 'z-ai/glm4.7',
  'glm4.7': 'z-ai/glm4.7'
};

app.use(cors());
app.use(express.json());

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

app.post('/v1/chat/completions', async (req, res) => {
  try {
    let { model, messages, temperature, max_tokens, stream, top_p } = req.body;

    const mappedModel = MODEL_MAPPING[model] || model;
    
    if (ENABLE_THINKING_MODE && messages && messages.length > 0) {
      const thinkingPrompt = {
        role: 'system',
        content: 'Think step by step and show your reasoning process.'
      };
      
      if (messages[0].role !== 'system') {
        messages = [thinkingPrompt, ...messages];
      } else {
        messages[0].content += '\n' + thinkingPrompt.content;
      }
    }

    const nvidiaRequest = {
      model: mappedModel,
      messages: messages,
      temperature: temperature || 0.7,
      top_p: top_p || 1,
      max_tokens: max_tokens || 1024,
      stream: stream || false
    };

    console.log('Proxying request to NVIDIA NIM:', {
      originalModel: model,
      mappedModel: mappedModel,
      messageCount: messages?.length,
      thinkingMode: ENABLE_THINKING_MODE
    });

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

      let responseData = response.data;
      
      console.log('NVIDIA API Response:', JSON.stringify(responseData, null, 2));
      
      if (!responseData || !responseData.choices || !responseData.choices[0]) {
        console.error('Invalid response structure from NVIDIA API');
        return res.status(500).json({
          error: {
            message: 'Invalid response from NVIDIA API',
            type: 'api_response_error'
          }
        });
      }
      
      if (SHOW_REASONING && responseData.choices[0].message) {
        const originalContent = responseData.choices[0].message.content;
        responseData.choices[0].message.content = `[Reasoning enabled]\n${originalContent}`;
      }

      res.json(responseData);
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

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      type: 'server_error'
    }
  });
});

app.listen(PORT, () => {
  console.log(`NVIDIA NIM Proxy server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
  if (!NVIDIA_API_KEY) {
    console.warn('WARNING: NVIDIA_API_KEY environment variable is not set!');
  }
}); 
