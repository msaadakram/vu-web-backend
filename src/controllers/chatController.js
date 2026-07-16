const { chatCompletion } = require('../config/doai');

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

    const reply = await chatCompletion({
      messages,
      temperature: 0.7,
      maxTokens: 1024,
      timeout: 30000,
    });

    res.json({ status: 'success', data: { reply } });
  } catch (err) {
    if (err.name === 'DoaiError' && err.status) {
      return res.status(err.status).json({ status: 'error', message: err.message });
    }
    next(err);
  }
};
