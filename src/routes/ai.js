const express = require('express');
const OpenAI = require('openai');

const router = express.Router();

function requireApiKey(req, res, next) {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ message: 'OPENAI_API_KEY no configurada' });
  }
  next();
}

router.post('/chat', requireApiKey, async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const store = String(process.env.OPENAI_STORE || '').toLowerCase() === 'true';

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({ model, input: messages, store });

    const outputText = response?.output_text
      || response?.output?.[0]?.content?.[0]?.text
      || response?.choices?.[0]?.message?.content
      || '';

    return res.json({ reply: outputText });
  } catch (err) {
    console.error('[ai/chat] error:', err?.response?.data || err?.message || err);
    return res.status(500).json({ message: err?.message || 'Error de AI' });
  }
});

module.exports = router;
