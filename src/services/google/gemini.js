const { GoogleGenerativeAI } = require('@google/generative-ai');

function getGeminiKey() {
  return process.env.gemini || process.env.GEMINI_API_KEY || '';
}

function getModelCandidates() {
  const preferred = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  return [
    preferred,
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro'
  ].filter((value, index, array) => value && array.indexOf(value) === index);
}

async function askGemini(prompt, options = {}) {
  const key = getGeminiKey();

  if (!key) {
    throw new Error('Missing Gemini API key. Add `gemini=` or `GEMINI_API_KEY=` to .env.');
  }

  const genAI = new GoogleGenerativeAI(key);
  const candidates = getModelCandidates();

  let lastError = null;

  for (const modelName of candidates) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxOutputTokens ?? 900
        }
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      return {
        text,
        model: modelName
      };
    } catch (error) {
      lastError = error;

      const message = String(error?.message || '');
      const retryableModelError =
        error?.status === 404 ||
        message.includes('is not found') ||
        message.includes('not supported');

      if (!retryableModelError) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Gemini request failed.');
}

module.exports = {
  askGemini
};