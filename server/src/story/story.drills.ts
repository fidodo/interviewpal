// 1-minute drills: short Speak stories that practise one skill. The prompts come from these fixed lists, so starting
// a drill costs no AI call; only marking a take does. A drill is a StoryPractice with one of these kinds, so takes,
// retells, the scoring guide, recordings and clean-up all work as they do for stories.
import type { FrameworkKey } from "./story.frameworks";

export const DRILL_KINDS = ["ANSWER_FIRST", "INTRO", "IMPROMPTU", "NO_FILLER", "PAUSE"] as const;
export type DrillKind = (typeof DRILL_KINDS)[number];
export const isDrill = (kind: string): kind is DrillKind => (DRILL_KINDS as readonly string[]).includes(kind);

type Dimension = "structure" | "clarity" | "specifics" | "presence" | "delivery";

interface Drill {
  label: string;
  // What you do, shown on the Speak page.
  description: string;
  targetSeconds: number;
  // The dimension this drill trains: its feedback comes first.
  focus: Dimension;
  framework: FrameworkKey;
  audience: string;
  // For the marker: what this drill is checking.
  instruction: string;
  // Shown after the first take, like a story's coaching notes.
  coachingNotes: string[];
  prompts: string[];
}

export const DRILLS: Record<DrillKind, Drill> = {
  ANSWER_FIRST: {
    label: "Answer first",
    description: "Answer an interview question with the answer in your first sentence.",
    targetSeconds: 30,
    focus: "structure",
    framework: "ANSWER_FIRST",
    audience: "an interviewer",
    instruction: "the first sentence must directly answer the question; then one reason or piece of evidence; then stop. Mark structure mainly on whether the answer comes first.",
    coachingNotes: ["Your first sentence is the answer itself, not a set-up", "One reason or example backs it up", "Stop when you've answered: no long wind-down"],
    prompts: [
      "Have you ever disagreed with a technical decision? What did you do?",
      "What's your biggest strength as an engineer?",
      "Why are you leaving your current role?",
      "Do you prefer working alone or in a team?",
      "What's the hardest bug you've fixed?",
      "How do you handle a deadline you can't meet?",
      "Would you choose SQL or NoSQL for a new product? Why?",
      "What do you do when a code review comment feels wrong?",
      "Have you ever mentored someone?",
      "What's one thing you'd change about how your team works?",
      "How do you decide when code is good enough to ship?",
      "Why do you want to work in AI engineering?",
    ],
  },
  INTRO: {
    label: "Tell me about yourself",
    description: "A 60-second introduction: now, how you got here, what's next.",
    targetSeconds: 60,
    focus: "structure",
    framework: "PRESENT_PAST_FUTURE",
    audience: "an interviewer at the start of an interview",
    instruction: "a short introduction in present, past, future order: what they do now with one achievement, one or two relevant past steps, then what they want next. Mark structure on that order, and presence on whether it sounds owned and confident.",
    coachingNotes: ["Start with what you do now, not where you were born or studied", "One achievement with a result", "End on what you want next and why this kind of role fits"],
    prompts: [
      "Tell me about yourself.",
      "Walk me through your background.",
      "Introduce yourself to a new team on your first day.",
      "Tell me about yourself, for an AI engineering role.",
      "Introduce yourself to someone you've just met at a tech meetup.",
      "Give me the short version of your career so far.",
    ],
  },
  IMPROMPTU: {
    label: "Impromptu",
    description: "Talk about a random topic with no preparation, using PREP.",
    targetSeconds: 60,
    focus: "clarity",
    framework: "PREP",
    audience: "a colleague",
    instruction: "an unprepared answer on a random topic. Look for a clear point stated early, a reason, one example, and the point restated. Mark clarity mainly on how easy it was to follow.",
    coachingNotes: ["Pick a side or a point in the first sentence", "Give one reason and one concrete example", "Come back to your point at the end"],
    prompts: [
      "Is it better to be a generalist or a specialist?",
      "Should every developer learn to write tests first?",
      "What makes a good meeting?",
      "Remote work or office work: which is better for learning?",
      "What's the most useful tool you use every day, and why?",
      "Should junior developers use AI coding assistants?",
      "What's one habit that made you better at your job?",
      "Is documentation worth the time it takes?",
      "What makes a team feel safe to make mistakes in?",
      "Should you rewrite old code or improve it bit by bit?",
      "What's a skill outside tech that helps you at work?",
      "What would you teach a new developer in their first week?",
    ],
  },
  NO_FILLER: {
    label: "No-filler minute",
    description: "Explain something you know well with no \"um\", \"like\" or \"I think\".",
    targetSeconds: 60,
    focus: "delivery",
    framework: "PREP",
    audience: "a friend outside tech",
    instruction: "explaining something familiar with as few fillers and hedges as possible: a short silent pause is better than a filler. Mark delivery mainly on the measured fillers and hedges.",
    coachingNotes: ["Pause silently instead of saying \"um\" or \"like\"", "Say points plainly: drop \"I think\", \"maybe\" and \"kind of\"", "Slow down slightly: fillers come from rushing to the next word"],
    prompts: [
      "Explain what you do at work to a friend outside tech.",
      "Explain how the internet gets a web page to your phone.",
      "Explain what an API is.",
      "Describe your favourite project and why you liked it.",
      "Explain how you'd plan a weekend trip.",
      "Explain what a database is for.",
      "Describe how your team decides what to build next.",
      "Explain why passwords should be long.",
      "Explain how you learn a new programming language.",
      "Describe a normal working day for you.",
    ],
  },
  PAUSE: {
    label: "Pause on purpose",
    description: "Make three points, with a deliberate pause between each.",
    targetSeconds: 60,
    focus: "delivery",
    framework: "PREP",
    audience: "a team in a meeting",
    instruction: "three clearly separated points with a deliberate pause between them. The transcript can't show pauses, so check that there are three distinct points, each said cleanly and not run together with \"and\" or \"so\".",
    coachingNotes: ["Signpost: \"Three things. First…\"", "Stop for a full second after each point", "Don't join points with \"and\" or \"so\": end the sentence, pause, start the next"],
    prompts: [
      "Give three reasons your team should write better commit messages.",
      "Share three lessons from a project that went wrong.",
      "Give three tips for a developer's first week.",
      "Name three things that make code easy to review.",
      "Give three reasons to automate deployments.",
      "Share three things you look for in a good teammate.",
      "Give three ways to make a meeting shorter.",
      "Name three risks of shipping on a Friday.",
    ],
  },
};

// A prompt for a new drill, avoiding the ones the user had most recently.
export function pickDrillPrompt(kind: DrillKind, recent: string[]) {
  const all = DRILLS[kind].prompts;
  const fresh = all.filter((p) => !recent.includes(p));
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

// The drill to suggest for the dimension that needs the most work.
export const DRILL_FOR: Record<Dimension, DrillKind> = {
  structure: "ANSWER_FIRST",
  clarity: "IMPROMPTU",
  specifics: "ANSWER_FIRST",
  presence: "INTRO",
  delivery: "NO_FILLER",
};

// What the client needs to list the drills.
export const DRILL_LIST = DRILL_KINDS.map((kind) => ({ kind, label: DRILLS[kind].label, description: DRILLS[kind].description, targetSeconds: DRILLS[kind].targetSeconds, focus: DRILLS[kind].focus }));
