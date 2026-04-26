function yesNo(value) {
  return value ? 'Yes' : 'No';
}

function code(value) {
  return `\`${String(value ?? 'unknown')}\``;
}

function diffField(name, before, after, inline = true) {
  if (String(before ?? '') === String(after ?? '')) return null;
  return { name, value: `Before: ${code(before)}\nAfter: ${code(after)}`, inline };
}

function compactFields(fields) {
  return fields.filter(Boolean).slice(0, 25);
}

module.exports = { yesNo, code, diffField, compactFields };
