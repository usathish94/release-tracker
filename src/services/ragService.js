import { CRICKET_GLOSSARY } from '../data/cricketGlossary.js';

// Common words carry no topic signal and would otherwise dominate cosine
// similarity purely by frequency (e.g. "if"/"the"/"is" appear in almost every
// entry) - filtering them out is what makes term-overlap retrieval usable
// without a real embedding model.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'if', 'what',
  'when', 'how', 'does', 'do', 'this', 'that', 'are', 'was', 'were', 'be', 'been', 'with', 'by',
  'as', 'its', 'their', 'they', 'you', 'i', 'we', 'not', 'no', 'yes', 'can', 'could', 'would',
  'should', 'will', 'shall', 'may', 'might', 'must', 'have', 'has', 'had', 'happens', 'happen',
]);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => !STOPWORDS.has(token));
}

function termFrequencies(tokens) {
  const freq = new Map();
  for (const token of tokens) freq.set(token, (freq.get(token) ?? 0) + 1);
  return freq;
}

// Precomputed once from the fixed glossary: terms that show up in most
// entries (e.g. "match", "team") get down-weighted relative to terms that
// pick out one specific entry (e.g. "lbw", "duckworth").
const DOC_TERM_FREQS = CRICKET_GLOSSARY.map((entry) => termFrequencies(tokenize(entry.text)));
const IDF = (() => {
  const docFreq = new Map();
  for (const freq of DOC_TERM_FREQS) {
    for (const term of freq.keys()) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  }
  const idf = new Map();
  for (const [term, df] of docFreq) idf.set(term, Math.log(CRICKET_GLOSSARY.length / (1 + df)) + 1);
  return idf;
})();

function tfidfVector(freq) {
  const vec = new Map();
  for (const [term, count] of freq) vec.set(term, count * (IDF.get(term) ?? Math.log(CRICKET_GLOSSARY.length + 1)));
  return vec;
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  for (const [term, weightA] of vecA) dot += weightA * (vecB.get(term) ?? 0);
  const magnitude = (vec) => Math.sqrt([...vec.values()].reduce((sum, w) => sum + w * w, 0));
  const denom = magnitude(vecA) * magnitude(vecB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Retrieval step of RAG: TF-IDF cosine similarity over the small in-repo
 * glossary (no embeddings API or vector DB needed at this size). Swap for
 * real embeddings + pgvector (this app already runs Postgres) once the
 * corpus grows past what term overlap handles well.
 */
export function retrieveGlossaryEntries(query, { topK = 2 } = {}) {
  const queryVec = tfidfVector(termFrequencies(tokenize(query)));
  return CRICKET_GLOSSARY
    .map((entry, i) => ({ entry, score: cosineSimilarity(queryVec, tfidfVector(DOC_TERM_FREQS[i])) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((r) => r.score > 0)
    .map((r) => r.entry);
}
