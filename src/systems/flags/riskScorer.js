function calculateRiskScore(flags = []) {
  if (!flags.length) return 0;

  const weights = {
    nuke: 1.2,
    raid: 1.0,
    automod: 0.45,
    manual: 0.8
  };

  const now = Date.now();
  let score = 0;

  for (const flag of flags) {
    const ageDays = Math.max(
      0,
      (now - new Date(flag.created_at).getTime()) / 86400000
    );

    const decay = Math.max(0.25, 1 - ageDays / 180);
    const weight = weights[flag.type] || 0.65;

    score += (flag.confidence || 0) * weight * decay;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = {
  calculateRiskScore
};