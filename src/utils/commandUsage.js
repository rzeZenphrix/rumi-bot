function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return [String(value)];
}

function stripLeadingPrefix(value = '') {
  return String(value || '')
    .trim()
    .replace(/^[/,!.?]/, '');
}

function stripOldSyntax(value = '') {
  return String(value || '')
    .replace(/[<>[\]]/g, '')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanUsageLine(value = '') {
  return stripOldSyntax(stripLeadingPrefix(value));
}

function getRawUsageLines(command = {}) {
  const source = asArray(command.usageLines).length
    ? asArray(command.usageLines)
    : asArray(command.usage);

  return source
    .map(cleanUsageLine)
    .filter(Boolean);
}

function getRawExampleLines(command = {}) {
  const source = asArray(command.exampleLines).length
    ? asArray(command.exampleLines)
    : asArray(command.examples);

  return source
    .map(cleanUsageLine)
    .filter(Boolean);
}

function prefixLine(prefix, line) {
  const clean = cleanUsageLine(line);
  if (!clean) return null;
  return clean.startsWith(prefix) ? clean : `${prefix}${clean}`;
}

function getUsageLines(command, prefix) {
  const lines = getRawUsageLines(command);
  const fallback = command?.fullName || command?.name || '';

  return (lines.length ? lines : [fallback])
    .map((line) => prefixLine(prefix, line))
    .filter(Boolean);
}

function getExampleLines(command, prefix) {
  const lines = getRawExampleLines(command);
  const usage = getUsageLines(command, prefix);

  return (lines.length ? lines : usage)
    .map((line) => prefixLine(prefix, line))
    .filter(Boolean);
}

function codeBlock(lines = []) {
  const safeLines = lines.filter(Boolean);
  return ['```txt', ...(safeLines.length ? safeLines : ['n/a']), '```'].join('\n');
}

function buildUsageText(command, prefix, options = {}) {
  const maxExamples = Number(options.maxExamples || 4);
  const usage = getUsageLines(command, prefix);
  const examples = getExampleLines(command, prefix).slice(0, maxExamples);

  return [
    '**Usage**',
    codeBlock(usage),
    '',
    '**Example(s)**',
    codeBlock(examples.length ? examples : usage)
  ].join('\n');
}

function buildInvalidUsageText(command, prefix, extraMessage = null) {
  return [
    extraMessage,
    buildUsageText(command, prefix)
  ].filter(Boolean).join('\n\n');
}

module.exports = {
  asArray,
  stripLeadingPrefix,
  stripOldSyntax,
  cleanUsageLine,
  prefixLine,
  getRawUsageLines,
  getRawExampleLines,
  getUsageLines,
  getExampleLines,
  buildUsageText,
  buildInvalidUsageText
};