const DOAI_API_KEY = process.env.DOAI_API_KEY;
const DOAI_BASE_URL = process.env.DOAI_BASE_URL || 'https://inference.do-ai.run/v1';
const DOAI_MODEL = process.env.DOAI_MODEL || 'alibaba-qwen3-32b';

if (!DOAI_API_KEY) {
  console.warn('[DOAI] Missing DOAI_API_KEY — AI blog generation will fail.');
}

class DoaiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.name = 'DoaiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Call the DigitalOcean Serverless Inference chat-completions endpoint.
 * @param {object} opts
 * @param {Array<{role:string,content:string}>} opts.messages
 * @param {boolean} [opts.jsonMode=false]
 * @param {number} [opts.maxTokens=4000]
 * @param {number} [opts.temperature=0.7]
 * @returns {Promise<string>} The content text from choices[0].message
 */
async function chatCompletion({ messages, jsonMode = false, maxTokens, temperature = 0.7 }) {
  if (!DOAI_API_KEY) {
    throw new DoaiError(0, 'DOAI_API_KEY not configured');
  }

  const body = {
    model: DOAI_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens || parseInt(process.env.DOAI_MAX_TOKENS || '6000', 10),
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(`${DOAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DOAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `DO AI request failed: ${res.status}`;
    throw new DoaiError(res.status, msg, data);
  }

  const choice = data?.choices?.[0];
  if (!choice) {
    throw new DoaiError(0, 'No choices in DO AI response', data);
  }

  let raw = choice.message?.content || '';

  // Some models (e.g. alibaba-qwen3-32b) put the actual content only in
  // reasoning_content. deepseek-4-flash returns content properly.
  // Keep the fallback for the qwen model in case someone switches back.
  if (!raw && choice.message?.reasoning_content) {
    const rc = choice.message.reasoning_content;
    if (jsonMode) {
      const jsonBlock = rc.match(/\{[\s\S]*\}/);
      if (jsonBlock) raw = jsonBlock[0];
    } else {
      const lines = rc.split('\n').filter(Boolean);
      raw = lines.join(' ').trim();
    }
  }

  if (jsonMode) {
    return stripAndParseJson(raw);
  }

  return raw;
}

/**
 * Strip markdown fences and parse JSON. Returns the parsed object on success,
 * or falls back to extracting the largest {…} block from the text.
 */
function stripAndParseJson(text) {
  let cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt to extract the largest {…} block
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        throw new DoaiError(0, 'Failed to parse JSON from AI response', cleaned);
      }
    }
    throw new DoaiError(0, 'Failed to parse JSON from AI response', cleaned);
  }
}

module.exports = { chatCompletion, DoaiError };
