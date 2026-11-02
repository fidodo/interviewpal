import { PresetDeck, t } from "./types";

export const aiEngineering: PresetDeck = {
  deck: "AI Engineering",
  slug: "ai-engineering",
  terms: [
    t(
      "Embedding",
      "A list of numbers that represents the meaning of a piece of text, so similar meanings end up close together.",
      "An embedding model turns text (or images) into a fixed-length vector. Texts with similar meaning point in similar directions, which is what makes semantic search and clustering work. You compare embeddings with cosine similarity or a dot product.",
      "We embed every document chunk once at index time, and embed the user's question at query time so we can find the nearest chunks.",
      ["A fixed-length vector of numbers", "Similar meaning gives nearby vectors", "Compared with cosine similarity or dot product"],
      "Token: a piece of text the model reads, not a vector of meaning.",
      "How would you let users search your docs by meaning rather than exact keywords?"
    ),
    t(
      "RAG (retrieval-augmented generation)",
      "Answering with an LLM by first retrieving relevant documents and putting them in the prompt.",
      "Instead of relying on what the model memorised in training, a RAG system searches your own data for relevant passages and includes them in the prompt, so the answer is grounded in current, private information and can cite sources.",
      "Rather than fine-tuning on our handbook, we used RAG so answers stay current when the handbook changes and every answer can cite the page it came from.",
      ["Retrieve relevant passages first", "Put them in the prompt as context", "Grounds answers in your own, current data"],
      "Fine-tuning: changes the model's weights; RAG changes what the model sees at question time.",
      "How would you build a chatbot that answers questions about your company's internal documents?"
    ),
    t(
      "Chunking",
      "Splitting documents into smaller passages before embedding them, so retrieval returns focused pieces of text.",
      "Whole documents are too long and too mixed in meaning to embed well. Chunking splits them into passages, by size, by structure such as headings, or with overlap, and the chunk size trades off context against precision.",
      "Our first version chunked every 500 characters and cut sentences in half, so we switched to splitting on headings with a small overlap.",
      ["Splits long documents into passages", "Size and boundaries affect retrieval quality", "Overlap keeps context across boundaries"],
      null,
      "Your RAG system often retrieves the right document but the wrong part of it. What would you change?"
    ),
    t(
      "Vector database",
      "A database built to store embeddings and quickly find the vectors nearest to a query vector.",
      "Vector databases (or vector extensions such as pgvector) index embeddings with approximate nearest-neighbour structures like HNSW, so similarity search stays fast across millions of vectors. Many also support metadata filters.",
      "We stored the embeddings in Postgres with pgvector instead of adding a separate vector database, because we only had a few hundred thousand chunks.",
      ["Stores embeddings", "Fast nearest-neighbour search", "Often approximate (e.g. HNSW) with metadata filters"],
      null,
      "How would you store and search a few million document embeddings efficiently?"
    ),
    t(
      "Cosine similarity",
      "A measure of how similar two vectors are by the angle between them, from -1 to 1.",
      "Cosine similarity is the dot product of two vectors divided by their lengths, so it ignores magnitude and compares direction. For unit-length embeddings it ranks results the same as a plain dot product.",
      "Because our embeddings are normalised to unit length, we use the dot product, which gives the same ranking as cosine similarity and is cheaper.",
      ["Compares direction, not length", "Dot product divided by the lengths", "Equals the dot product for unit vectors"],
      "Euclidean distance: straight-line distance, which is affected by vector length.",
      "How do you decide which stored passages are most relevant to a user's question?"
    ),
    t(
      "Hallucination",
      "When a model states something fluent and confident that isn't true or isn't supported by its sources.",
      "LLMs generate likely-sounding text, not verified facts, so they can invent details, citations or APIs. Grounding with retrieval, asking the model to refuse when context is missing, and evaluating faithfulness all reduce it.",
      "To cut hallucinations, the prompt tells the model to answer only from the retrieved context and to say so when the context doesn't cover the question.",
      ["Confident but false or unsupported output", "Comes from predicting likely text", "Reduced by grounding, refusals and evals"],
      null,
      "Users report your assistant sometimes makes up policy details. How would you fix it?"
    ),
    t(
      "Context window",
      "The maximum number of tokens a model can take in and produce in a single call.",
      "Everything the model sees, including system prompt, history, retrieved documents and its answer, must fit in the context window. Long contexts cost more and models can miss details in the middle, so you still choose carefully what goes in.",
      "Even with a large context window, we cap retrieved context at about 1,500 tokens, because answers got worse and pricier when we stuffed in everything.",
      ["Limit on tokens per call", "Includes prompt, history, context and output", "Bigger isn't free: cost and lost-in-the-middle"],
      null,
      "Why not just put all of your documents into the prompt?"
    ),
    t(
      "Token",
      "The unit of text a language model reads and writes, often a word or part of a word.",
      "Models split text into tokens with a tokenizer; in English a token is roughly four characters. Pricing, latency and context limits are all measured in tokens.",
      "We estimate cost per answer from input and output tokens, so we log both for every model call.",
      ["Unit of text for the model", "Roughly 4 characters of English", "Drives cost, latency and limits"],
      "Embedding: a vector of meaning, not a unit of text.",
      "How would you estimate and control the cost of an LLM feature?"
    ),
    t(
      "Temperature",
      "A setting that controls how random a model's output is; low is more deterministic, high is more varied.",
      "Temperature scales the probability distribution the model samples from. Low values suit extraction, classification and grading; higher values suit brainstorming. It doesn't make a model more or less knowledgeable.",
      "We run the grader at temperature 0.2 so the same answer gets the same mark, but use a higher temperature for generating practice questions.",
      ["Controls randomness of sampling", "Low for consistent tasks, high for creative ones", "Doesn't change what the model knows"],
      null,
      "Your LLM-based grader gives different scores for the same answer. What would you look at?"
    ),
    t(
      "Prompt injection",
      "An attack where text the model reads contains instructions that try to override the developer's instructions.",
      "Any untrusted text in the prompt, such as user input, retrieved web pages or documents, can carry instructions like 'ignore previous instructions'. Defences include separating data from instructions, limiting what tools the model can call, and checking outputs.",
      "One of our indexed wiki pages contained a hidden instruction, so we wrap retrieved text as data and tell the model never to follow instructions inside it.",
      ["Instructions hidden in untrusted input", "Can come from users or retrieved content", "Mitigate by treating content as data and limiting tools"],
      "Jailbreak: the user directly tries to bypass safety rules; injection hides instructions in content.",
      "How would you protect an assistant that reads emails and can take actions on the user's behalf?"
    ),
    t(
      "Guardrails",
      "Checks around a model's input and output that block or fix unsafe, off-topic or malformed responses.",
      "Guardrails can validate output against a schema, filter sensitive data, keep the assistant on topic, or refuse harmful requests. They live in code around the model, not just in the prompt.",
      "Every model response is validated against a zod schema, and we retry once if it's malformed instead of showing the user broken output.",
      ["Checks on input and output", "Enforced in code, not only the prompt", "Covers safety, format and scope"],
      null,
      "How do you make sure an LLM feature never shows users malformed or unsafe output?"
    ),
    t(
      "Evals",
      "Repeatable tests that measure how well an LLM system performs on a fixed set of examples.",
      "Because outputs vary, LLM features are measured with evaluation sets: questions with expected answers or rubrics, scored by code or by a judge model. Evals catch regressions when you change prompts, models or retrieval.",
      "Before switching models we ran our eval set of 200 questions and saw retrieval hit rate hold steady but faithfulness drop, so we didn't switch.",
      ["A fixed set of test cases", "Scored by code or an LLM judge", "Catch regressions from prompt or model changes"],
      "Unit tests: check deterministic code; evals measure quality on varied model outputs.",
      "How would you know a prompt change actually improved your assistant?"
    ),
    t(
      "LLM-as-a-judge",
      "Using a language model to grade other model outputs against a rubric or reference answer.",
      "Where exact matching doesn't work, a judge model can mark correctness, faithfulness or tone. It's cheap and scalable, but needs a clear rubric, low temperature, and spot checks against human labels because judges have biases.",
      "We use an LLM judge for answer correctness, but we checked it against 50 human-labelled answers first and it agreed 92% of the time.",
      ["A model grades outputs", "Needs a clear rubric and reference", "Validate against human labels"],
      null,
      "How would you score free-text answers from your chatbot at scale?"
    ),
    t(
      "Fine-tuning",
      "Further training a pretrained model on your own examples to change its behaviour or style.",
      "Fine-tuning adjusts model weights using labelled examples. It's good for consistent format, tone or narrow tasks, but it's not the best way to add fresh or frequently changing knowledge, where retrieval is usually better.",
      "We fine-tuned a small model to classify support tickets into our categories, but kept product facts in RAG so updates don't need retraining.",
      ["Changes model weights with your examples", "Good for style, format, narrow tasks", "Poor fit for frequently changing facts"],
      "RAG: adds knowledge at question time without retraining.",
      "When would you fine-tune a model instead of improving the prompt or adding retrieval?"
    ),
    t(
      "Reranking",
      "A second pass that reorders retrieved results with a more accurate but slower model.",
      "Fast vector search returns a broad candidate list; a reranker (a cross-encoder or an LLM) scores each candidate against the query and reorders them, so the best few go into the prompt.",
      "We retrieve the top 30 chunks with vector search, then rerank them and keep only the top 5 for the prompt.",
      ["Second, more accurate ranking pass", "Applied to a shortlist from fast search", "Improves what goes into the prompt"],
      null,
      "Your retrieval finds relevant documents but they're rarely in the top three. What would you add?"
    ),
    t(
      "Hybrid search",
      "Combining keyword search and vector search so you get both exact matches and matches by meaning.",
      "Vector search misses exact identifiers like error codes and product SKUs; keyword search (BM25) misses paraphrases. Hybrid search runs both and merges the rankings, often with reciprocal rank fusion.",
      "Users searched for error codes like QS-3107 and vector search kept missing them, so we added BM25 and merged the two result lists.",
      ["Keyword plus vector search", "Catches exact IDs and paraphrases", "Merged with e.g. reciprocal rank fusion"],
      null,
      "Your semantic search can't find documents when users type exact error codes. How would you fix it?"
    ),
    t(
      "Agent",
      "An LLM system that decides which tools to call, step by step, to reach a goal.",
      "An agent runs a loop: the model reads the task and the results so far, picks a tool (search, calculator, API) or answers, and repeats. Step limits, tool permissions and logging keep it safe and debuggable.",
      "We capped the agent at five tool calls per question and logged each step, because early versions looped on the same search.",
      ["Model chooses tools in a loop", "Uses tool results to decide next step", "Needs step limits, permissions, tracing"],
      "Chain: fixed steps decided by the developer, not the model.",
      "How would you build an assistant that can look up an order and then issue a refund?"
    ),
    t(
      "Function calling (tool use)",
      "Letting a model return a structured request to call one of your functions instead of plain text.",
      "You describe available functions with JSON schemas; the model replies with a function name and arguments, your code runs it, and you send the result back. Your code, not the model, actually executes anything.",
      "The model returns a get_order call with the order id, our backend runs it with the user's permissions, and we pass the result back for the final answer.",
      ["Functions described with schemas", "Model returns name and arguments", "Your code executes and returns the result"],
      null,
      "How would you let an LLM check live data, like a customer's order status?"
    ),
    t(
      "Latency vs cost trade-off",
      "Balancing response speed against model spend, for example by choosing smaller models or caching.",
      "Bigger models and longer prompts are slower and cost more per call. Teams cut both with smaller models for easy steps, caching repeated work, streaming the answer, and trimming context.",
      "We route simple FAQ questions to a small model and only use the large one when retrieval confidence is low, which halved our cost per answer.",
      ["Bigger models: slower and pricier", "Use small models, caching, streaming", "Measure p95 latency and cost per answer"],
      null,
      "Your LLM feature is too slow and too expensive. What would you try first?"
    ),
    t(
      "Grounding",
      "Tying a model's answer to specific source material so every claim can be traced back to it.",
      "A grounded answer only states what the provided sources support, ideally with citations. It's measured by faithfulness: whether each claim in the answer is backed by the retrieved text.",
      "We show numbered citations under each answer, and our eval checks that every cited passage actually supports the sentence it's attached to.",
      ["Answers come from given sources", "Claims are traceable, often cited", "Measured as faithfulness"],
      "Hallucination: the opposite, unsupported claims.",
      "How would you make users trust the answers from your internal assistant?"
    ),
  ],
};
