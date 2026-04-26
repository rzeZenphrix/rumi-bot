function geminiKey() {
  return process.env.GEMINI_API_KEY || process.env.gemini || process.env.GEMINI || '';
}

function googleKey() {
  return process.env.GOOGLE_API_KEY || process.env.google || process.env.GOOGLE || '';
}

module.exports = {
  geminiKey,
  googleKey
};
