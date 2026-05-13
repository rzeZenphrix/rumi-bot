const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../../services/database');
const { searchWeb, shouldUseWebSearch } = require('./webSearch');

const DEFAULT_MAX_CHUNKS = Number(process.env.RAG_MAX_CHUNKS || 5);
const DEFAULT_CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 800);
const DEFAULT_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 120);
const DEFAULT_MIN_SCORE = Number(process.env.RAG_MIN_SCORE || 0.35);

function envFlag(name, fallback = true) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function hashText(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]+/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 1);
}

function uniqueTerms(text) {
  return new Set(tokenize(text));
}

function chunkText(text, options = {}) {
  const size = Math.max(200, Number(options.size || DEFAULT_CHUNK_SIZE));
  const overlap = Math.max(0, Math.min(size - 50, Number(options.overlap || DEFAULT_OVERLAP)));
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const chunks = [];

  for (let start = 0; start < normalized.length; start += size - overlap) {
    const slice = normalized.slice(start, start + size).trim();
    if (slice.length >= 30) chunks.push({ text: slice, token_count: tokenize(slice).length });
    if (start + size >= normalized.length) break;
  }

  return chunks;
}

function localDocuments(client) {
  const root = path.resolve(__dirname, '..', '..', '..');
  const docsDir = path.join(root, 'docs');
  const files = [
    path.join(root, 'data', 'changelog.json'),
    path.join(root, 'feature.txt'),
    path.join(root, 'note.txt')
  ];

  const docs = [];
  for (const file of files) {
    const text = safeRead(file);
    if (text) docs.push({ source: path.basename(file), title: path.basename(file), category: 'local', text });
  }

  if (fs.existsSync(docsDir)) {
    for (const entry of fs.readdirSync(docsDir).filter((name) => /\.(md|txt|json)$/i.test(name)).slice(0, 25)) {
      const text = safeRead(path.join(docsDir, entry));
      if (text) docs.push({ source: `docs/${entry}`, title: entry, category: 'docs', text });
    }
  }

  const catalogEntries = client?.commandRegistry?.getPublicEntries?.({ includeHidden: false, includeOwnerOnly: true }) || [];
  if (catalogEntries.length) {
    const text = catalogEntries
      .map((entry) => {
        const source = entry.subcommand || entry.command || entry.source || {};
        return `${entry.fullName || entry.name} | ${entry.category || 'misc'} | ${source.description || entry.description || ''} | usage: ${source.usage || entry.usage || ''} | examples: ${(source.examples || entry.examples || []).join('; ')}`;
      })
      .join('\n');
    docs.push({ source: 'commands', title: 'Command catalog', category: 'commands', text });
  } else if (client?.commands?.size) {
    const text = [...client.commands.values()]
      .map((command) => `${command.name} | ${command.category || 'misc'} | ${command.description || ''} | usage: ${command.usage || ''} | examples: ${(command.examples || []).join('; ')}`)
      .join('\n');
    docs.push({ source: 'commands', title: 'Command catalog', category: 'commands', text });
  }

  return docs;
}

async function ingestDocuments(documents = [], options = {}) {
  const stored = [];
  for (const doc of documents) {
    const id = doc.id || hashText(`${doc.guildId || 'global'}:${doc.source}:${doc.title}`);
    const contentHash = hashText(doc.text);
    const chunks = chunkText(doc.text, options).map((chunk, index) => ({
      ...chunk,
      metadata: {
        source: doc.source,
        title: doc.title,
        category: doc.category,
        guildId: doc.guildId || null,
        userId: doc.userId || null,
        index
      }
    }));

    if (db.isSupabaseConfigured?.()) {
      await db.upsertRagDocument({
        id,
        guildId: doc.guildId || null,
        userId: doc.userId || null,
        source: doc.source,
        title: doc.title,
        category: doc.category,
        contentHash,
        metadata: doc.metadata || {}
      }).catch(() => null);
      await db.replaceRagChunks(id, chunks).catch(() => null);
    }

    stored.push({ ...doc, id, contentHash, chunks });
  }

  return stored;
}

function chunkCandidatesFromDocs(docs = []) {
  return docs.flatMap((doc) => chunkText(doc.text).map((chunk, index) => ({
    text: chunk.text,
    source: doc.source,
    title: doc.title,
    category: doc.category,
    guildId: doc.guildId || null,
    userId: doc.userId || null,
    createdAt: doc.updatedAt || doc.createdAt || null,
    index
  })));
}

async function storedChunkCandidates(options = {}) {
  if (!db.isSupabaseConfigured?.() || typeof db.listRagChunks !== 'function') return [];
  const rows = await db.listRagChunks({ limit: 300 }).catch(() => []);
  const guildId = options.guildId || null;

  return rows
    .map((row) => {
      const doc = row.rag_documents || {};
      return {
        text: row.text,
        source: doc.source || row.metadata?.source || 'stored',
        title: doc.title || row.metadata?.title || 'Stored knowledge',
        category: doc.category || row.metadata?.category || 'general',
        guildId: doc.guild_id || null,
        userId: doc.user_id || null,
        createdAt: row.created_at,
        index: row.chunk_index
      };
    })
    .filter((item) => !item.guildId || item.guildId === guildId);
}

function scoreCandidate(candidate, query, options = {}) {
  const queryTerms = uniqueTerms(query);
  if (!queryTerms.size) return 0;

  const textTerms = uniqueTerms(candidate.text);
  const titleTerms = uniqueTerms(candidate.title);
  let hits = 0;
  let titleHits = 0;

  for (const term of queryTerms) {
    if (textTerms.has(term)) hits += 1;
    if (titleTerms.has(term)) titleHits += 1;
  }

  const coverage = hits / queryTerms.size;
  const titleBoost = titleHits ? 0.12 : 0;
  const categoryBoost = options.category && candidate.category === options.category ? 0.12 : 0;
  const recencyBoost = candidate.createdAt ? Math.max(0, 0.08 - ((Date.now() - new Date(candidate.createdAt).getTime()) / 86400000) * 0.002) : 0;
  const phraseBoost = String(candidate.text || '').toLowerCase().includes(String(query || '').toLowerCase()) ? 0.2 : 0;

  return Math.min(1, coverage + titleBoost + categoryBoost + recencyBoost + phraseBoost);
}

function rerank(candidates, query, options = {}) {
  const minScore = Number(options.minScore || DEFAULT_MIN_SCORE);
  return candidates
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, query, options) }))
    .filter((candidate) => candidate.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, Number(options.maxChunks || DEFAULT_MAX_CHUNKS));
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

async function retrieveRagContext(client, query, options = {}) {
  if (!envFlag('RAG_ENABLED', true)) return [];

  const local = localDocuments(client);
  if (options.ingestLocal !== false) await ingestDocuments(local, options).catch(() => null);

  const candidates = [
    ...chunkCandidatesFromDocs(local),
    ...await storedChunkCandidates(options)
  ];

  return rerank(candidates, query, options);
}

async function buildRagPrompt(client, query, options = {}) {
  let context = await retrieveRagContext(client, query, options);
  const needsWeb = context.length < 2 && shouldUseWebSearch(query);

  if (needsWeb) {
    const webResults = await searchWeb(query, options);
    const webContext = webResults.map((result, index) => ({
      text: `${result.snippet}\nURL: ${result.url}`,
      source: result.url,
      title: result.title,
      category: 'web',
      guildId: null,
      userId: null,
      createdAt: new Date().toISOString(),
      index,
      score: 0.5
    }));
    context = [...context, ...webContext].slice(0, Number(options.maxChunks || DEFAULT_MAX_CHUNKS));
  }
  const citations = context.map((item, index) => ({
    id: index + 1,
    source: item.source,
    title: item.title,
    category: item.category,
    score: Number(item.score.toFixed(3))
  }));

  const contextText = context.length
    ? context.map((item, index) => `[${index + 1}] ${item.title || item.source} (${item.source})\n${item.text}`).join('\n\n')
    : 'No trusted retrieval context was found.';

  const debug = process.env.RAG_DEBUG === 'true'
    ? `\nRAG debug: ${JSON.stringify(citations)}`
    : '';

  return {
    prompt: [
      'You are Rumi, a kawaii anime-style Discord companion.',
      'Use the retrieval context first. If the answer is not in context, say that the source is unavailable instead of guessing.',
      'Separate local bot knowledge, guild knowledge, and web search results. Treat web results as external and cite their URL source.',
      'Keep guild-specific knowledge isolated. Do not use another guild source for this guild.',
      'When useful, cite sources as [1], [2], etc.',
      'Your final answer must stay under 1000 characters.',
      '',
      'Known feature summary:',
      buildFeatureSummary(client),
      '',
      `User question: ${query}`,
      '',
      'Retrieval context:',
      contextText,
      debug
    ].join('\n'),
    context,
    citations
  };
}

module.exports = {
  buildRagPrompt,
  retrieveRagContext,
  ingestDocuments,
  chunkText,
  rerank
};
