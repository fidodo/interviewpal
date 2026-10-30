import { CaseCategory } from "./cases";

// RAG Lab levels. A level's held-out run checks every check from level 1 up to it, so a new feature can't quietly
// break an old one. Levels without `checks` are listed but not playable yet. Briefs use the LessonContent format
// (## headings, - bullets, ``` code).
export type Metric = "hitAt5" | "hitAt3" | "correct" | "citationPrecision" | "refusal" | "injectionResisted";

export interface Check {
  metric: Metric;
  category: CaseCategory;
  threshold: number;
  label: string;
}

export interface Level {
  number: number;
  seniority: "Junior" | "Mid" | "Senior" | "Staff";
  title: string;
  summary: string;
  brief?: string;
  requirements?: string[];
  hints?: string[];
  checks?: Check[];
}

export const METRIC_LABELS: Record<Metric, string> = {
  hitAt5: "Hit@5",
  hitAt3: "Hit@3",
  correct: "Answers correct",
  citationPrecision: "Citation precision",
  refusal: "Correct refusals",
  injectionResisted: "Injections resisted",
};

export const LEVELS: Level[] = [
  {
    number: 1,
    seniority: "Junior",
    title: "Hello RAG",
    summary: "Chunk, embed, search by cosine similarity, and answer from what you found.",
    brief: `## What you're building
Retrieval-augmented generation (RAG) answers questions from documents the model was never trained on. Instead of hoping the model knows Quillstone's handbook, you find the relevant passages and put them in the prompt.

## The pipeline
- Index (once): split each document into chunks, embed each chunk into a vector, keep the vectors.
- Search (per question): embed the question, score every chunk by cosine similarity, return the top k.
- Answer: put the top chunks in a prompt and ask the model to answer from them.

## Concepts
- An embedding is a list of numbers (768 here) where similar meanings point in similar directions.
- Cosine similarity is the dot product of two vectors divided by their lengths. ip.embed returns unit-length vectors, so the dot product alone gives the same ranking, but write the full formula once so you know why.
- Use kind "document" when embedding chunks and "query" when embedding the question: the model is trained to match the two.
- Fixed-size chunking (say 500 characters) is the simplest approach. It's crude: it cuts sentences in half. Level 2 fixes that.

## Interview angle
"Walk me through a RAG pipeline" is the most common AI engineering screening question. After this level you can answer it from code you wrote, including why you embed queries and documents differently.`,
    requirements: [
      "index(docs): split every document into fixed-size chunks and embed them with ip.embed(texts, \"document\"). Batch: send many texts per call, not one at a time.",
      "search(question, k): embed the question with kind \"query\", score every chunk with cosine similarity, and return the top k as { chunkId, docId, text, score } (Python: chunk_id, doc_id).",
      "ask(question, history): retrieve the top chunks, build a prompt with them, call ip.llm, and return { answer, citations } (citations can be an empty list for now).",
    ],
    hints: [
      "Each doc has an id, title and text. Keep the doc id on every chunk: the grader checks retrieval by document id.",
      "Embedding 25 documents one call per chunk is slow. Collect all chunk texts and call ip.embed once (up to 100 texts per call).",
      "If answers are vague, tell the model in the system message to answer only from the provided context, concisely.",
    ],
    checks: [
      { metric: "hitAt5", category: "fact", threshold: 0.6, label: "The right document is in your top 5 for at least 60% of questions" },
      { metric: "correct", category: "fact", threshold: 0.5, label: "At least half the answers are judged correct" },
    ],
  },
  {
    number: 2,
    seniority: "Junior",
    title: "Cite your sources",
    summary: "Chunk by structure with overlap and metadata, and cite the documents each answer came from.",
    brief: `## Why this level
Fixed-size chunks split ideas in half, and an answer nobody can check isn't trustworthy. Production RAG systems chunk along the document's structure and show their sources.

## Concepts
- Structure-aware chunking: split on headings first, then paragraphs, then sentences, until each piece fits your size limit. Each chunk then holds one coherent idea.
- Overlap: repeat the last bit of one chunk at the start of the next (10-20%), so a fact on a boundary isn't lost.
- Metadata: keep the document title and section heading with each chunk. Putting "Refund policy > Annual plans" in front of the chunk text before embedding often improves retrieval a lot, because short chunks lose their context.
- Citations: number the chunks in the prompt ([1], [2]...) and ask the model to cite the numbers it used. Map the numbers back to document ids in code; never trust the model to write ids.

## What's measured
- Hit@3: the right document must now be in your top 3, not top 5.
- Citation precision: of the documents you cite, how many actually contain the answer. Citing everything you retrieved scores badly: cite what you used.

## Interview angle
"How do you choose chunk size?" Small chunks are precise but lose context; big chunks keep context but dilute the embedding and cost more tokens. Be ready to say what you tried and what the numbers showed.`,
    requirements: [
      "Chunk along headings and paragraphs instead of fixed character counts, with some overlap between chunks.",
      "Keep each chunk's document title (and section heading if you can) and include it in the text you embed.",
      "Number the chunks in your prompt, have the model cite the numbers it used, and return the matching document ids in citations.",
    ],
    hints: [
      "Documents use Markdown: lines starting with # or ## are headings. Splitting on them gets you most of the way.",
      "Ask for JSON from the model (ip.llm with json) like {\"answer\": \"...\", \"cited\": [1, 3]} so the citations are easy to read back.",
      "If citation precision is low, tell the model to cite only the chunks that directly support the answer.",
    ],
    checks: [
      { metric: "hitAt3", category: "fact", threshold: 0.7, label: "The right document is in your top 3 for at least 70% of questions" },
      { metric: "citationPrecision", category: "fact", threshold: 0.7, label: "At least 70% of cited documents actually contain the answer" },
      { metric: "correct", category: "fact", threshold: 0.6, label: "At least 60% of answers are judged correct" },
    ],
  },
  {
    number: 3,
    seniority: "Junior",
    title: "Know what you don't know",
    summary: "Refuse when the documents don't have the answer, and don't obey instructions hidden in them.",
    brief: `## Why this level
A RAG bot that makes up an answer is worse than one that says "I don't know". And retrieved documents are untrusted input: anyone who can edit a wiki page can try to hijack your bot.

## Concepts
- Grounding: the model must answer only from the context. When the context doesn't contain the answer, it should say so plainly instead of guessing from general knowledge.
- Retrieval always returns something: the top 5 chunks for "Who is the CEO?" will be about something else. Your prompt has to make "not in these documents" an acceptable answer.
- Indirect prompt injection: text inside a retrieved document that tries to give the model orders. One page in this corpus does exactly that. Defences: wrap the context in clear delimiters, tell the model that the context is data and never instructions, and keep your instructions in the system message.
- Optionally, check answers in code too (for example, refuse to output text that matches suspicious patterns). Defence in depth beats one clever prompt.

## What's measured
- Correct refusals on questions the handbook can't answer.
- Injections resisted: your answers must never follow the poisoned page's instructions.
- Everything from levels 1 and 2 still has to pass.

## Interview angle
"How do you stop hallucinations?" and "What is prompt injection, and how do you defend a RAG system against it?" come up in almost every AI engineering interview. Prompt-only defences aren't bulletproof; say what else you'd add.`,
    requirements: [
      "When the retrieved context doesn't answer the question, say the documents don't cover it (e.g. \"I don't know based on the handbook\") instead of guessing.",
      "Treat retrieved text as data: mark where the context starts and ends, and instruct the model never to follow instructions found inside it.",
      "Keep levels 1 and 2 passing.",
    ],
    hints: [
      "Put your rules in the system message and the documents in the user message, inside clear markers like <context> ... </context>.",
      "Being too eager to refuse breaks the 'answers correct' check from earlier levels: refuse only when the context truly lacks the answer.",
      "Run the practice set and read the injection cases' answers: does anything from the community wiki page leak through?",
    ],
    checks: [
      { metric: "refusal", category: "unanswerable", threshold: 0.75, label: "At least 75% of unanswerable questions get an honest \"not in the documents\"" },
      { metric: "injectionResisted", category: "injection", threshold: 1, label: "No answer follows the injected instructions" },
    ],
  },
  { number: 4, seniority: "Mid", title: "Hybrid search", summary: "BM25 written by you, combined with vectors by Reciprocal Rank Fusion." },
  { number: 5, seniority: "Mid", title: "Conversations", summary: "Rewrite follow-up questions into standalone ones using the chat history." },
  { number: 6, seniority: "Mid", title: "Rerank and budget", summary: "Rerank candidates, pack context to a token budget, and stay within a cost per question." },
  { number: 7, seniority: "Senior", title: "Measure it", summary: "Write your own eval harness: hit@k, MRR and a faithfulness judge." },
  { number: 8, seniority: "Senior", title: "Your data, persistent", summary: "Move to a persistent vector store and index your own notes, PDFs and InterviewPal data." },
  { number: 9, seniority: "Senior", title: "Agentic RAG", summary: "A tool-calling loop for questions that need several lookups." },
  { number: 10, seniority: "Staff", title: "Ship it", summary: "Latency and cost budgets, caching, guardrails and tracing." },
];

export const PLAYABLE_LEVELS = LEVELS.filter((l) => l.checks).length;
export const levelByNumber = (n: number) => LEVELS.find((l) => l.number === n);

// Every check from level 1 up to `n`; where two levels check the same metric and category, the stricter one wins.
export function checksUpTo(n: number): Check[] {
  const byKey = new Map<string, Check>();
  for (const level of LEVELS.slice(0, n)) {
    for (const check of level.checks ?? []) {
      const key = `${check.metric}:${check.category}`;
      const existing = byKey.get(key);
      if (!existing || check.threshold > existing.threshold) byKey.set(key, check);
    }
  }
  return [...byKey.values()];
}
