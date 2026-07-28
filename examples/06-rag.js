// Run: node examples/06-rag.js
//
// RAG: retrieve the relevant documents for a question, inject only those
// into the prompt, and instruct the model to answer solely from what was
// retrieved. Retrieval here is a plain TF-IDF cosine similarity over an
// in-memory corpus so the example has no external dependencies — swap
// `retrieve()` for real embeddings (e.g. Voyage AI) + a vector index (this
// app already runs Postgres, so pgvector is the natural fit) in production.
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../src/config/env.js";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

const CORPUS = [
  {
    id: "dls",
    text:
      "The Duckworth-Lewis-Stern (DLS) method recalculates a target score when a rain-affected " +
      "limited-overs match is shortened, based on wickets lost and overs remaining for each side.",
  },
  {
    id: "powerplay",
    text:
      "In One Day Internationals, the first 10 overs are the mandatory powerplay: only two " +
      "fielders are allowed outside the 30-yard circle, encouraging aggressive batting early.",
  },
  {
    id: "follow-on",
    text:
      "In Test cricket, if the team batting second trails by 200 runs or more after the first " +
      "innings, the team batting first can enforce the follow-on, making the trailing team bat again immediately.",
  },
  {
    id: "super-over",
    text:
      "A Super Over breaks a tie in a limited-overs match: each team bats one over with two " +
      "wickets in hand, and whoever scores more wins outright.",
  },
];

function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function termFrequencies(tokens) {
  const freq = new Map();
  for (const token of tokens) freq.set(token, (freq.get(token) ?? 0) + 1);
  return freq;
}

function cosineSimilarity(freqA, freqB) {
  let dot = 0;
  for (const [term, countA] of freqA) dot += countA * (freqB.get(term) ?? 0);
  const magnitude = (freq) => Math.sqrt([...freq.values()].reduce((sum, c) => sum + c * c, 0));
  const denom = magnitude(freqA) * magnitude(freqB);
  return denom === 0 ? 0 : dot / denom;
}

/** Returns the top-k corpus documents most similar to the query. */
function retrieve(query, { topK = 2 } = {}) {
  const queryFreq = termFrequencies(tokenize(query));
  return CORPUS
    .map((doc) => ({ doc, score: cosineSimilarity(queryFreq, termFrequencies(tokenize(doc.text))) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((r) => r.score > 0)
    .map((r) => r.doc);
}

async function answerWithRag(question) {
  const retrieved = retrieve(question);
  const context = retrieved.map((doc) => `[${doc.id}] ${doc.text}`).join("\n\n");

  const response = await anthropic.messages.create({
    model: env.claudeModel,
    max_tokens: 300,
    system:
      "Answer the user's question using ONLY the reference material below. " +
      "If the material doesn't cover the question, say so explicitly instead of guessing.\n\n" +
      `Reference material:\n${context || "(no relevant material found)"}`,
    messages: [{ role: "user", content: question }],
  });

  return { retrievedIds: retrieved.map((d) => d.id), answer: response.content.find((b) => b.type === "text")?.text };
}

const result = await answerWithRag("What happens if a match gets tied?");
console.log("Retrieved docs:", result.retrievedIds);
console.log("Answer:", result.answer);

const offTopic = await answerWithRag("Who won the 1996 World Cup final?");
console.log("\nRetrieved docs:", offTopic.retrievedIds);
console.log("Answer:", offTopic.answer);
