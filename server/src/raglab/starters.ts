// The file a new RAG Lab project starts from: the RagBot contract with empty methods, and how to use the toolkit.
// It deliberately contains no solution.
export const LANGUAGES = ["python", "typescript", "javascript"] as const;
export type LabLanguage = (typeof LANGUAGES)[number];

const PYTHON = `# Your RAG bot. The \`ip\` toolkit (all calls marked "await" are async):
#   await ip.corpus()                         -> [{"id", "title", "text"}] (index() is given these)
#   await ip.embed(texts, kind="document")    -> one vector (768 floats) per text; use kind="query" for questions
#   await ip.llm(messages, json_mode=False, temperature=0.2, max_tokens=800) -> {"text", "usage"}
#        messages: [{"role": "system" | "user" | "assistant", "content": "..."}]
#   ip.tokens(text)                           -> approximate token count
#   ip.log(stage, data)                       -> adds a line to the trace under the results
# numpy is available (import numpy as np), and print() output shows in the trace.
import ip


class RagBot:
    def __init__(self):
        self.chunks = []  # for example {"chunk_id", "doc_id", "text", "vector"}

    async def index(self, docs):
        """Split each document into chunks, embed them, and keep them."""
        # TODO (level 1)
        pass

    async def search(self, question, k):
        """Return the k most relevant chunks: [{"chunk_id", "doc_id", "text", "score"}], best first."""
        # TODO (level 1)
        return []

    async def ask(self, question, history):
        """Answer from retrieved chunks: {"answer": str, "citations": [doc_id, ...]}.
        history is the earlier conversation: [{"role": "user" | "assistant", "content": str}]."""
        # TODO (level 1)
        return {"answer": "", "citations": []}
`;

const TYPESCRIPT = `// Your RAG bot. The \`ip\` toolkit is available everywhere:
//   await ip.corpus()                                 -> Doc[] (index() is given these)
//   await ip.embed(texts, "document" | "query")       -> number[][] (768 numbers per text)
//   await ip.llm(messages, { json?, temperature?, maxTokens? }) -> { text, usage }
//        messages: { role: "system" | "user" | "assistant"; content: string }[]
//   ip.tokens(text)                                   -> approximate token count
//   ip.log(stage, data)                               -> adds a line to the trace under the results
// console.log() output also shows in the trace.

type Doc = { id: string; title: string; text: string };
type Turn = { role: "user" | "assistant"; content: string };
type Chunk = { chunkId: string; docId: string; text: string; vector: number[] };
type Hit = { chunkId: string; docId: string; text: string; score: number };

export class RagBot {
  chunks: Chunk[] = [];

  /** Split each document into chunks, embed them, and keep them. */
  async index(docs: Doc[]): Promise<void> {
    // TODO (level 1)
  }

  /** Return the k most relevant chunks, best first. */
  async search(question: string, k: number): Promise<Hit[]> {
    // TODO (level 1)
    return [];
  }

  /** Answer from retrieved chunks. history is the earlier conversation. */
  async ask(question: string, history: Turn[]): Promise<{ answer: string; citations: string[] }> {
    // TODO (level 1)
    return { answer: "", citations: [] };
  }
}
`;

const JAVASCRIPT = `// Your RAG bot. The \`ip\` toolkit is available everywhere:
//   await ip.corpus()                                 -> [{ id, title, text }] (index() is given these)
//   await ip.embed(texts, "document" | "query")       -> one array of 768 numbers per text
//   await ip.llm(messages, { json, temperature, maxTokens }) -> { text, usage }
//        messages: [{ role: "system" | "user" | "assistant", content: "..." }]
//   ip.tokens(text)                                   -> approximate token count
//   ip.log(stage, data)                               -> adds a line to the trace under the results
// console.log() output also shows in the trace.

export class RagBot {
  constructor() {
    this.chunks = []; // for example { chunkId, docId, text, vector }
  }

  /** Split each document into chunks, embed them, and keep them. */
  async index(docs) {
    // TODO (level 1)
  }

  /** Return the k most relevant chunks, best first: [{ chunkId, docId, text, score }]. */
  async search(question, k) {
    // TODO (level 1)
    return [];
  }

  /** Answer from retrieved chunks: { answer, citations: [docId, ...] }. history is the earlier conversation. */
  async ask(question, history) {
    // TODO (level 1)
    return { answer: "", citations: [] };
  }
}
`;

export const STARTERS: Record<LabLanguage, string> = { python: PYTHON, typescript: TYPESCRIPT, javascript: JAVASCRIPT };
