import { ChallengeKind, LevelEditor } from "./types";

const MAX_HISTORY = 10;
const MAX_OUTPUT_CHARS = 3000;

// Must match the turtle shim in client/src/kids/runner/python.worker.ts and the blocks in client/src/kids/editors/blocks.ts.
const RUNTIME = [
  `Code runs as Python 3 inside the browser. There is no input(), no files and no internet; programs must run on their own and finish within a few seconds.`,
  `A simple "turtle" module is available for drawing on a 400x400 canvas with (0, 0) in the middle: forward(n), backward(n), left(deg), right(deg), penup(), pendown(), pencolor(name), pensize(n), goto(x, y), setheading(deg), circle(radius), dot(size), home(). Use "import turtle" then "turtle.forward(50)" style calls, or "t = turtle.Turtle()". Colours are simple names like "red", "blue", "green", "orange", "purple", "black".`,
].join("\n");

const BLOCK_NAMES: Record<string, string> = {
  turtle: `"move forward", "move backward", "turn left", "turn right", "pen up", "pen down", "set pen colour", "set pen size", "draw a circle"`,
  loops: `"repeat N times"`,
  math: `number blocks and arithmetic (+ - × ÷)`,
  variables: `"set variable to", "change variable by"`,
  text: `"print" and text blocks`,
  logic: `"if / else" and comparisons (= < >)`,
};

export interface ChildContext {
  name: string;
  age: number;
}

export interface LevelContext {
  order: number;
  title: string;
  editor: LevelEditor;
  concepts: string[];
  toolbox: string[];
  challengesToPass: number;
}

export interface PastChallenge {
  title: string;
  passed: boolean;
}

export interface ChatTurn {
  role: "CHILD" | "PAL";
  text: string;
}

function safetyPreamble(child: ChildContext): string {
  return [
    `You are Pal, a friendly coding tutor for a ${child.age}-year-old learner called ${child.name}. A parent supervises this account and can read everything.`,
    `Rules you always follow:`,
    `- Use short sentences and words a ${child.age}-year-old knows. Be warm and encouraging, never sarcastic. Celebrate effort.`,
    `- Stay on the lesson: coding, maths and logic. If asked about anything else, or anything unsafe, scary, adult or personal, kindly say that's not something you can help with and steer back to the challenge.`,
    `- Never ask for or repeat personal information (full name, address, school, phone, photos, passwords).`,
    `- Teach, don't do: guide with questions and hints. Never write out the full solution.`,
  ].join("\n");
}

function levelDescription(level: LevelContext): string {
  const lines = [`Level ${level.order}: "${level.title}". Concepts to practise: ${level.concepts.join("; ")}.`];
  if (level.editor === LevelEditor.BLOCKS) {
    const blocks = level.toolbox.map((c) => BLOCK_NAMES[c]).filter(Boolean).join(", ");
    lines.push(
      `The learner builds code with drag-and-drop blocks (like Scratch), not by typing. The only blocks available are: ${blocks}. Describe steps using those block names, never Python syntax.`,
      `The learner cannot use any other block, so never mention or suggest one that isn't in that list (for example, no repeat/loop block unless it is listed). Challenges must be solvable with only these blocks.`
    );
  } else {
    lines.push(`The learner types real Python into a code editor.`);
  }
  return lines.join("\n");
}

function truncate(text: string): string {
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n…(truncated)` : text;
}

export function challengePrompt(params: { child: ChildContext; level: LevelContext; passedAtLevel: number; history: PastChallenge[] }): string {
  const { child, level, passedAtLevel, history } = params;
  const recent = history.slice(-MAX_HISTORY);
  const recentFails = recent.slice(-2).filter((c) => !c.passed).length;
  const pacing =
    recentFails >= 2
      ? `The learner has struggled with the last two challenges. Make this one a little easier and very clearly explained.`
      : `This is challenge ${passedAtLevel + 1} of ${level.challengesToPass} needed to finish the level. Make each one a small step harder than the last, while staying inside this level's concepts.`;
  const starter =
    level.editor === LevelEditor.BLOCKS
      ? `"starterCode" must be "" (the learner starts with an empty block workspace).`
      : `"starterCode" is a short Python skeleton with helpful # comments showing where to write code. It must NOT contain the solution. Use "" if no skeleton helps.`;

  return [
    safetyPreamble(child),
    ``,
    RUNTIME,
    ``,
    levelDescription(level),
    pacing,
    ``,
    `Challenges already given (do not repeat these):`,
    recent.length ? recent.map((c) => `- ${c.title} (${c.passed ? "passed" : "not passed yet"})`).join("\n") : "(none yet)",
    ``,
    `Create ONE fun, bite-sized coding challenge that can be finished in 5–15 minutes.`,
    `- "title": a short catchy name. "story": 1–2 playful sentences that set the scene. "instructions": clear numbered steps (use \\n between steps) saying exactly what the program should do.`,
    `- "kind": "DRAW" if the program draws with the turtle, "TEXT" if it prints.`,
    `- "expectedOutput": for a TEXT challenge whose output is always the same, the exact text it should print (lines separated by \\n). Use null for DRAW challenges or when output is random.`,
    `- ${starter}`,
    ``,
    `Respond ONLY with JSON of the shape: { "title": string, "story": string, "instructions": string, "kind": "DRAW" | "TEXT", "starterCode": string, "expectedOutput": string | null }`,
  ].join("\n");
}

export function reviewPrompt(params: {
  child: ChildContext;
  level: LevelContext;
  challenge: { title: string; instructions: string; kind: ChallengeKind; expectedOutput: string | null };
  code: string;
  output: string;
  error: string | null;
  turtle: string;
  outputMatches: boolean | null;
}): string {
  const { child, level, challenge, code, output, error, turtle, outputMatches } = params;
  const verdictHint =
    error != null
      ? `The program stopped with an error, so "passed" must be false. Help them understand the error in simple words.`
      : outputMatches === true
        ? `The printed output exactly matches the expected output, so "passed" must be true.`
        : outputMatches === false
          ? `The printed output does not exactly match the expected output. Pass it only if the difference is trivial (spacing, capital letters, punctuation) and the idea is right.`
          : `Decide from the code, its output and the drawing summary whether it does what the instructions ask. Be generous about small creative differences.`;

  return [
    safetyPreamble(child),
    ``,
    levelDescription(level),
    ``,
    `Challenge: ${challenge.title}`,
    `Instructions:\n${challenge.instructions}`,
    challenge.expectedOutput ? `Expected output:\n${challenge.expectedOutput}` : ``,
    ``,
    level.editor === LevelEditor.BLOCKS ? `Their blocks, turned into Python:` : `Their Python code:`,
    truncate(code),
    ``,
    `What it printed:\n${output ? truncate(output) : "(nothing)"}`,
    error != null ? `Error:\n${truncate(error)}` : ``,
    challenge.kind === ChallengeKind.DRAW ? `What the turtle drew:\n${turtle || "(nothing)"}` : ``,
    ``,
    verdictHint,
    `Give "stars" 1–3: 3 = solved neatly, 2 = solved, 1 = not solved yet or needs work.`,
    `"praise": 1–2 sentences about something specific they did well. "nextStep": if not passed, one hint toward the fix (not the answer); if passed, one idea to make it even cooler. ${level.editor === LevelEditor.BLOCKS ? "Talk about blocks, not Python syntax." : ""}`,
    `Respond ONLY with JSON of the shape: { "passed": boolean, "stars": number, "praise": string, "nextStep": string }`,
  ]
    .filter((line, i, all) => line !== `` || all[i - 1] !== ``)
    .join("\n");
}

export function helpPrompt(params: {
  child: ChildContext;
  level: LevelContext;
  challenge: { title: string; instructions: string };
  code: string;
  chat: ChatTurn[];
  message: string;
}): string {
  const { child, level, challenge, code, chat, message } = params;
  const recent = chat.slice(-MAX_HISTORY);
  return [
    safetyPreamble(child),
    ``,
    levelDescription(level),
    ``,
    `Challenge: ${challenge.title}`,
    `Instructions:\n${challenge.instructions}`,
    ``,
    `Their current ${level.editor === LevelEditor.BLOCKS ? "blocks (as Python)" : "code"}:`,
    code.trim() ? truncate(code) : "(empty so far)",
    ``,
    `Conversation so far:`,
    recent.length ? recent.map((t) => `${t.role === "CHILD" ? child.name : "Pal"}: ${t.text}`).join("\n") : "(none)",
    `${child.name}: ${message}`,
    ``,
    `Reply as Pal in at most 80 words. Give a hint or a guiding question, or explain an idea with a tiny example that is different from their challenge. Do not give the full solution even if asked; explain that working it out is how they get stronger.`,
    `Respond ONLY with JSON of the shape: { "reply": string }`,
  ].join("\n");
}
