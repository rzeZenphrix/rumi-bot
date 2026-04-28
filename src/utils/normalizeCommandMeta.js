function stripLeadingPrefix(value) {
  return String(value || '')
    .trim()
    .replace(/^[/,!.?]/, '');
}

function unique(list = []) {
  return [...new Set((list || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function deriveCommandExamples(command) {
  if (Array.isArray(command.examples) && command.examples.length) {
    return unique(command.examples.map((example) => stripLeadingPrefix(example)));
  }

  if (Array.isArray(command.subcommands) && command.subcommands.length) {
    const derived = command.subcommands
      .flatMap((subcommand) => Array.isArray(subcommand.examples) ? subcommand.examples : [])
      .map((example) => stripLeadingPrefix(example))
      .filter(Boolean);

    if (derived.length) return unique(derived);
  }

  return [stripLeadingPrefix(command.usage || command.name)];
}

function normalizeSubcommand(parentName, subcommand) {
  const normalized = {
    ...subcommand
  };

  normalized.description = String(
    normalized.description || `Manage ${parentName} ${normalized.name || 'action'}.`
  ).trim();

  const fallbackUsage = `${parentName} ${normalized.name || 'action'}`.trim();
  normalized.usage = stripLeadingPrefix(normalized.usage || fallbackUsage) || fallbackUsage;

  if (!Array.isArray(normalized.examples) || !normalized.examples.length) {
    normalized.examples = [normalized.usage];
  } else {
    normalized.examples = unique(
      normalized.examples.map((example) => stripLeadingPrefix(example || normalized.usage))
    );
  }

  return normalized;
}

function normalizeCommandMeta(command) {
  if (!command || typeof command !== 'object') return command;

  const normalized = command;
  normalized.description = String(normalized.description || 'No description provided.').trim();
  normalized.usage = stripLeadingPrefix(normalized.usage || normalized.name) || normalized.name;

  if (Array.isArray(normalized.subcommands)) {
    normalized.subcommands = normalized.subcommands.map((subcommand) =>
      normalizeSubcommand(normalized.name, subcommand)
    );
  }

  normalized.examples = deriveCommandExamples(normalized);
  return normalized;
}

module.exports = {
  normalizeCommandMeta
};
