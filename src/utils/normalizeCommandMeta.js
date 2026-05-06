function stripLeadingPrefix(value) {
  return String(value || '')
    .trim()
    .replace(/^[/,!.?]/, '');
}

function unique(list = []) {
  return [...new Set((list || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return [String(value)];
}

function normalizeUsageValue(value, fallback) {
  const lines = asArray(value)
    .map((line) => stripLeadingPrefix(line))
    .filter(Boolean);

  if (lines.length) return lines;

  const safeFallback = stripLeadingPrefix(fallback);
  return safeFallback ? [safeFallback] : [];
}

function normalizeExampleValue(value, fallbackLines = []) {
  const lines = asArray(value)
    .map((line) => stripLeadingPrefix(line))
    .filter(Boolean);

  if (lines.length) return unique(lines);

  return unique(fallbackLines);
}

function deriveCommandExamples(command, usageLines) {
  if (Array.isArray(command.examples) && command.examples.length) {
    return unique(command.examples.map((example) => stripLeadingPrefix(example)));
  }

  if (Array.isArray(command.subcommands) && command.subcommands.length) {
    const derived = command.subcommands
      .flatMap((subcommand) => asArray(subcommand.examples))
      .map((example) => stripLeadingPrefix(example))
      .filter(Boolean);

    if (derived.length) return unique(derived);
  }

  return unique(usageLines.length ? usageLines : [command.name]);
}

function normalizeSubcommand(parentName, subcommand) {
  const normalized = {
    ...subcommand
  };

  normalized.name = String(normalized.name || '').trim().toLowerCase();

  normalized.description = String(
    normalized.description || `Manage ${parentName} ${normalized.name || 'action'}.`
  ).trim();

  const fallbackUsage = `${parentName} ${normalized.name || 'action'}`.trim();
  const usageLines = normalizeUsageValue(normalized.usageLines || normalized.usage, fallbackUsage);

  normalized.usageLines = usageLines;
  normalized.usage = usageLines[0] || fallbackUsage;
  normalized.examples = normalizeExampleValue(normalized.exampleLines || normalized.examples, usageLines);

  if (Array.isArray(normalized.aliases)) {
    normalized.aliases = unique(normalized.aliases.map((alias) => alias.toLowerCase()));
  } else {
    normalized.aliases = [];
  }

  return normalized;
}

function normalizeCatalogEntry(parentCommand, entry) {
  const normalized = {
    ...entry
  };

  normalized.name = String(normalized.name || normalized.fullName || '').trim().toLowerCase();
  normalized.fullName = stripLeadingPrefix(normalized.fullName || normalized.name);
  normalized.parent = normalized.parent || parentCommand.name || null;
  normalized.category = normalized.category || parentCommand.category || 'misc';
  normalized.module = normalized.module || normalized.category;
  normalized.description = String(normalized.description || parentCommand.description || 'No description provided.').trim();

  const fallbackUsage = normalized.fullName || normalized.name;
  const usageLines = normalizeUsageValue(normalized.usageLines || normalized.usage, fallbackUsage);

  normalized.usageLines = usageLines;
  normalized.usage = usageLines[0] || fallbackUsage;
  normalized.examples = normalizeExampleValue(normalized.exampleLines || normalized.examples, usageLines);
  normalized.aliases = unique(normalized.aliases || []);

  return normalized;
}

function normalizeCommandMeta(command) {
  if (!command || typeof command !== 'object') return command;

  const normalized = command;

  normalized.name = String(normalized.name || '').trim().toLowerCase();
  normalized.category = String(normalized.category || 'misc').trim().toLowerCase() || 'misc';
  normalized.description = String(normalized.description || 'No description provided.').trim();

  const fallbackUsage = normalized.name;
  const usageLines = normalizeUsageValue(normalized.usageLines || normalized.usage, fallbackUsage);

  normalized.usageLines = usageLines;
  normalized.usage = usageLines[0] || normalized.name;

  if (Array.isArray(normalized.aliases)) {
    normalized.aliases = unique(normalized.aliases.map((alias) => String(alias).toLowerCase()));
  } else {
    normalized.aliases = [];
  }

  normalized.permissions = Array.isArray(normalized.permissions) ? normalized.permissions : [];
  normalized.botPermissions = Array.isArray(normalized.botPermissions) ? normalized.botPermissions : [];
  normalized.cooldown = Number.isFinite(Number(normalized.cooldown)) ? Number(normalized.cooldown) : 0;

  if (Array.isArray(normalized.subcommands)) {
    normalized.subcommands = normalized.subcommands
      .filter(Boolean)
      .map((subcommand) => normalizeSubcommand(normalized.name, subcommand))
      .filter((subcommand) => subcommand.name);
  } else {
    normalized.subcommands = [];
  }

  normalized.examples = deriveCommandExamples(normalized, usageLines);

  if (Array.isArray(normalized.catalogEntries)) {
    normalized.catalogEntries = normalized.catalogEntries
      .filter(Boolean)
      .map((entry) => normalizeCatalogEntry(normalized, entry))
      .filter((entry) => entry.name || entry.fullName);
  } else {
    normalized.catalogEntries = [];
  }

  return normalized;
}

module.exports = {
  normalizeCommandMeta,
  stripLeadingPrefix,
  unique,
  asArray
};
