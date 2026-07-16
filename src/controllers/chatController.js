const { chatCompletionStream, DoaiError } = require('../config/doai');

const SYSTEM_PROMPT = `You are a helpful AI assistant for Virtual University of Pakistan's study portal (VirtualU). 
You help students with:
- Information about VU programs (BSCS, BS Software Engineering, BS Accounting & Finance, MBA, BBA, MS programs, etc.)
- Admission processes, fee structures, and eligibility criteria
- Study resources, past papers, handouts, and exam preparation
- Course subjects and semester-wise study schemes
- VU LMS, online learning, and distance education
- General academic and career guidance

Be concise, accurate, and friendly. If you don't know something, say so rather than making it up.
Keep responses brief and helpful — aim for 2-4 sentences unless the question requires more detail.`;

exports.sendMessage = async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ status: 'error', message: 'Message is required' });
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.slice(-10),
      { role: 'user', content: message.trim() },
    ];

    const aiRes = await chatCompletionStream({ messages, temperature: 0.7, maxTokens: 1024, timeout: 30000 });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed?.choices?.[0]?.delta?.content || '';
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch {
          // skip malformed JSON chunks
        }
      }
    }

    // parse remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const content = parsed?.choices?.[0]?.delta?.content || '';
            if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
          } catch {}
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    if (err.name === 'DoaiError' && err.status) {
      // try to send error as SSE
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        return res.end();
      }
      return res.status(err.status).json({ status: 'error', message: err.message });
    }
    next(err);
  }
};
