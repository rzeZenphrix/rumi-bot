const fs = require('fs');
const path = require('path');

const CORPUS_LIMIT = 6;

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function loadLocalDocs(client) {
  const root = path.resolve(__dirname, '..', '..', '..');
  const docsDir = path.join(root, 'docs');
  const docs = [];

  const files = [
    path.join(root, 'data', 'changelog.json'),
    path.join(root, 'feature.txt'),
    path.join(root, 'note.txt')
  ];

  for (const file of files) {
    const text = safeRead(file);
    if (text) docs.push({ source: path.basename(file), text });
  }

  if (fs.existsSync(docsDir)) {
    for (const entry of fs.readdirSync(docsDir).slice(0, 10)) {
      const fullPath = path.join(docsDir, entry);
      const text = safeRead(fullPath);
      if (text) docs.push({ source: `docs/${entry}`, text });
    }
  }

  if (client?.commands?.size) {
    const commandText = [...client.commands.values()]
      .map((command) => `${command.name} | ${command.description || ''} | usage: ${command.usage || ''} | examples: ${(command.examples || []).join('; ')}`)
      .join('\n');
    docs.push({ source: 'commands', text: commandText });
  }

  return docs;
}

function buildFeatureSummary(client) {
  if (!client?.commands?.size) return 'Feature summary unavailable.';

  const grouped = new Map();

  for (const command of client.commands.values()) {
    const category = String(command.category || 'misc').toLowerCase();
    if (!grouped.has(category)) grouped.set(category, []);
    if (grouped.get(category).length < 5) grouped.get(category).push(command.name);
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([category, names]) => `${category}: ${names.join(', ')}`)
    .join('\n');
}

function scoreDocument(doc, query) {
  const haystack = String(doc.text || '').toLowerCase();
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  let score = 0;

  for (const term of terms) {
    const count = haystack.split(term).length - 1;
    score += count * Math.max(1, term.length);
  }

  return score;
}

function retrieveLocalContext(client, query) {
  const docs = loadLocalDocs(client);
  return docs
    .map((doc) => ({ ...doc, score: scoreDocument(doc, query) }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, CORPUS_LIMIT)
    .map((doc) => ({
      source: doc.source,
      snippet: String(doc.text || '').slice(0, 1200)
    }));
}

async function webFallback(query) {
  if (process.env.WEB_SEARCH_ENABLED === 'false') return [];

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(url).then((res) => res.json()).catch(() => null);
  if (!response) return [];

  const contexts = [];
  if (response.AbstractText) {
    contexts.push({
      source: response.AbstractSource || 'DuckDuckGo',
      snippet: response.AbstractText
    });
  }

  for (const topic of response.RelatedTopics || []) {
    if (contexts.length >= 3) break;
    if (topic?.Text) {
      contexts.push({
        source: 'DuckDuckGo Related',
        snippet: topic.Text
      });
    }
  }

  return contexts;
}

async function buildRagPrompt(client, query) {
  const local = retrieveLocalContext(client, query);
  const web = local.length >= 2 ? [] : await webFallback(query);
  const context = [...local, ...web].slice(0, 6);

  const contextText = context.length
    ? context.map((item, index) => `[${index + 1}] ${item.source}\n${item.snippet}`).join('\n\n')
    : 'No retrieval context found.';

  return {
    prompt: [
      'You are Rumi, a kawaii anime-style Discord companion.',
      'You are here to converse, explain, suggest, and chat about Rumi features.',
      'You do not take on coding jobs, development tasks, or do work for the user.',
      'Your final answer must always stay under 1000 characters. Aim for 850 or less.',
      'Do not pretend to know things you do not know.',
      'Use retrieval context first. If context is weak, say so gently.',
      'Mention only features Rumi actually has or that appear in the retrieval context.',
      '',
      'Known feature summary:',
      buildFeatureSummary(client),
      '',
      `User question: ${query}`,
      '',
      'Retrieval context:',
      contextText
    ].join('\n'),
    context
  };
}

module.exports = {
  buildRagPrompt
};
