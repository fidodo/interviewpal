// Speaking frameworks: the cheat sheets on /speak/frameworks and the "How to shape it" card on each story. Each
// story kind uses one (its steps are also the "Suggested shape" the marker scores structure against), and may
// suggest others that fit.

export interface Framework {
  key: string;
  name: string;
  // When to reach for it.
  use: string;
  steps: string[];
  // Fill in the brackets.
  template: string;
  example: string;
  mistake: string;
}

const list = [
  {
    key: "STAR",
    name: "STAR",
    use: "\"Tell me about a time…\" questions: a real story from your work or life.",
    steps: [
      "Situation: where and when, in a sentence or two",
      "Task: what you had to do and why it mattered",
      "Action: what you did, in the first person",
      "Result: what changed, with a number if you have one, and what you learned",
    ],
    template:
      "When I was [role] at [place], [the situation in one sentence]. I needed to [the task], because [why it mattered]. I [first action], then [second action]. As a result, [what changed, with a number], and I learned [the lesson].",
    example:
      "When I was a backend developer at a payments start-up, our checkout timed out at peak hours. I had to fix it before Black Friday, because timeouts were losing us sales. I profiled the slowest calls, added a cache in front of the fraud check and moved receipts to a queue. Peak-time failures dropped from 4% to under 0.5%, and I learned to measure before optimising.",
    mistake: "Spending most of the time on the situation, then rushing or skipping the result.",
  },
  {
    key: "EXPLAIN",
    name: "Point, why, how, example",
    use: "Explaining a concept so a particular person understands it.",
    steps: ["The point: what it is, in one sentence", "Why it matters to this audience", "How it works, one step at a time", "A concrete example or analogy"],
    template: "[The thing] is [what it is, in one sentence]. It matters to you because [the reason this listener cares]. It works like this: first [step], then [step]. For example, [a concrete example or analogy].",
    example:
      "Retrieval-augmented generation lets a chatbot answer from your own documents. That matters to you because it stops the bot making up answers about our product. It works like this: first we find the paragraphs most related to the question, then we hand only those to the model to answer from. It's like an open-book exam instead of answering from memory.",
    mistake: "Starting with the history or the details before saying what it is.",
  },
  {
    key: "PITCH",
    name: "Claim, reasons, evidence, ask",
    use: "Arguing a position or selling an idea.",
    steps: ["The claim: what you want them to believe or do", "Two or three reasons", "Evidence for each: a fact, a result or an example", "The ask: what happens next"],
    template: "We should [the claim]. First, [reason], because [evidence]. Second, [reason]: [evidence]. So I'd like to [the ask: what happens next, and by when].",
    example:
      "We should move our new services to TypeScript. First, it catches bugs before they ship: in the pilot, the compiler found three null errors that had reached production before. Second, onboarding is faster, because the types document the code. So I'd like to convert one service this sprint and review the results together.",
    mistake: "Ending without saying what you want them to do.",
  },
  {
    key: "OPEN_LAND",
    name: "Open, develop, land",
    use: "Any talk on your own topic.",
    steps: ["An opening that says what this is about", "The middle: the main points in order, each with an example", "A landing: the one thing you want them to remember"],
    template: "This is about [topic], and the one thing I'd like you to take away is [the point]. First, [point]: for example, [example]. Second, [point]: [example]. So: [the point again, in one sentence].",
    example:
      "This is about why I'm moving from full-stack into AI engineering, and the one thing I'd like you to take away is that it builds on what I already do. First, most AI features are still web features: I've shipped a RAG search page end to end. Second, the hard part is evaluation, and testing is something I'm good at. So: it's a step forward, not a restart.",
    mistake: "Listing points without saying why they matter, so there's nothing to remember.",
  },
  {
    key: "PREP",
    name: "PREP: point, reason, example, point",
    use: "Opinions and quick answers, especially when you have no time to prepare.",
    steps: ["Point: your answer or view, in one sentence", "Reason: why", "Example: one concrete case", "Point: say it again, so it lands"],
    template: "My view is [point]. The reason is [reason]. For example, [one concrete example]. So, [the point again].",
    example:
      "My view is that code review should be required for every change. The reason is that a second pair of eyes catches what tests miss. For example, last month a review caught a migration that would have locked our biggest table at peak time. So, every change gets a review.",
    mistake: "Forgetting the final point, so the answer trails off.",
  },
  {
    key: "ANSWER_FIRST",
    name: "Answer first",
    use: "Any direct question: say the answer, then back it up.",
    steps: ["The answer, in the first sentence", "One reason or piece of evidence", "Stop, or offer more detail"],
    template: "[The direct answer]. That's because [the reason or evidence]. I can go into [a detail] if that's useful.",
    example:
      "Yes, I've led a team: four developers on our billing rebuild last year. We shipped it in five months, a month early. I can go into how I split the work if that's useful.",
    mistake: "Building up to the answer: the listener has stopped listening by the time you get there.",
  },
  {
    key: "PRESENT_PAST_FUTURE",
    name: "Present, past, future",
    use: "\"Tell me about yourself\" and introductions.",
    steps: ["Present: what you do now, and one thing you're proud of", "Past: how you got here, one or two relevant steps", "Future: what you want next, and why this role fits"],
    template: "Right now I'm a [role] at [company], where I [one achievement]. Before that, I [one or two relevant steps]. Next, I want to [goal], which is why [this role] interests me.",
    example:
      "Right now I'm a full-stack developer at a fintech, where I rebuilt our onboarding flow and cut drop-off by a third. Before that, I spent three years building APIs for logistics companies. Next, I want to build AI features end to end, which is why this AI engineering role interests me.",
    mistake: "Reciting your CV in date order instead of choosing what's relevant.",
  },
  {
    key: "PROBLEM_SOLUTION_BENEFIT",
    name: "Problem, solution, benefit",
    use: "Proposing a change to a manager or team.",
    steps: ["Problem: what's wrong, and what it costs", "Solution: what you propose", "Benefit: what gets better, with a number if you can", "Ask: what you need from them"],
    template: "Right now [the problem], which costs us [time, money or risk]. I'd like to [the solution]. That would [the benefit, with a number]. To start, I need [the ask].",
    example:
      "Right now our deploys take 40 minutes, so we ship once a day at most. I'd like to split the test suite and run it in parallel. That would bring deploys under 10 minutes. To start, I need two days next sprint.",
    mistake: "Leading with the solution before anyone agrees there's a problem.",
  },
  {
    key: "WHAT_SO_WHAT",
    name: "What, so what, now what",
    use: "Updates, incident reports and reflecting on something that happened.",
    steps: ["What: what happened, in plain facts", "So what: why it matters, the impact", "Now what: what happens next"],
    template: "[What happened, in plain facts]. That matters because [the impact]. Next, [what you or the team will do].",
    example:
      "Yesterday the payments service was down for 20 minutes after a config change. That matters because about 300 customers couldn't check out. Next, we're adding a check that blocks config changes without a staged rollout.",
    mistake: "Stopping at the facts, with no meaning or next step.",
  },
  {
    key: "ANSWER_ADD_ASK",
    name: "Answer, add, ask",
    use: "Conversations: small talk, networking and the back-and-forth of an interview.",
    steps: ["Answer: respond to what they actually asked or said", "Add: one detail, example or opinion of your own", "Ask: a question back, or hand the conversation over"],
    template: "[A direct answer]. [One detail or example that makes it yours]. [A question back: \"How about you…?\" or \"What made you…?\"]",
    example:
      "Interviewer: How was your journey in? You: Easy, thanks: the train was quiet, so I read through my notes on your search product. I'm curious, how long has the team been working on it?",
    mistake: "Answering in one word and waiting, or talking for a minute without letting them in.",
  },
] as const satisfies readonly Framework[];

export type FrameworkKey = (typeof list)[number]["key"];
export const FRAMEWORKS: readonly Framework[] = list;
const byKey = new Map(FRAMEWORKS.map((f) => [f.key, f]));
export const framework = (key: FrameworkKey) => byKey.get(key)!;

// Which framework each story kind uses (its steps are the marker's suggested shape), and others that also fit.
export const KIND_FRAMEWORKS: Record<string, { main: FrameworkKey; also: FrameworkKey[] }> = {
  EXPERIENCE: { main: "STAR", also: [] },
  EXPLAIN: { main: "EXPLAIN", also: ["PREP"] },
  PITCH: { main: "PITCH", also: ["PROBLEM_SOLUTION_BENEFIT"] },
  OWN: { main: "OPEN_LAND", also: ["WHAT_SO_WHAT", "PREP"] },
  CONVERSATION: { main: "ANSWER_ADD_ASK", also: ["ANSWER_FIRST", "PRESENT_PAST_FUTURE"] },
  // 1-minute drills (story.drills.ts).
  ANSWER_FIRST: { main: "ANSWER_FIRST", also: ["PREP"] },
  INTRO: { main: "PRESENT_PAST_FUTURE", also: [] },
  IMPROMPTU: { main: "PREP", also: ["ANSWER_FIRST"] },
  NO_FILLER: { main: "PREP", also: [] },
  PAUSE: { main: "PREP", also: [] },
};

export function frameworksForKind(kind: string) {
  const k = KIND_FRAMEWORKS[kind] ?? KIND_FRAMEWORKS.OWN;
  return { main: framework(k.main), also: k.also.map((key) => ({ key, name: framework(key).name })) };
}
