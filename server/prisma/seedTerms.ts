import { PrismaClient } from "@prisma/client";
import { TERM_DECKS, presetKey } from "./terms";

// Upserts the starter term decks by presetKey: rewording a term updates it in place, and learners keep their
// progress. Run on its own with `npm run prisma:seed-terms`, or as part of `npm run prisma:seed`.
export async function seedTerms(prisma: PrismaClient) {
  let count = 0;
  for (const deck of TERM_DECKS) {
    for (const term of deck.terms) {
      const fields = {
        deck: deck.deck,
        term: term.term,
        oneLiner: term.oneLiner,
        explanation: term.explanation,
        example: term.example,
        keyPoints: JSON.stringify(term.keyPoints),
        confusedWith: term.confusedWith,
        interviewQuestion: term.interviewQuestion,
        distractors: "[]",
        source: "PRESET",
      };
      const key = presetKey(deck, term.term);
      await prisma.term.upsert({ where: { presetKey: key }, update: fields, create: { presetKey: key, ...fields } });
      count++;
    }
  }
  console.log(`Seeded ${count} starter terms in ${TERM_DECKS.length} decks.`);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedTerms(prisma)
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
