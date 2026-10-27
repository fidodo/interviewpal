import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { COURSES } from "./curriculum";

const prisma = new PrismaClient();

const STARTER_TOPICS: Record<string, string[]> = {
  Frontend: [
    "React hooks & lifecycle",
    "State management (Context/Redux/Zustand)",
    "CSS layout (Flexbox/Grid)",
    "Rendering performance & memoization",
    "Accessibility basics",
    "Browser event loop & rendering pipeline",
    "TypeScript with React",
    "Frontend testing (Jest/RTL)",
  ],
  Backend: [
    "REST API design",
    "Database schema design & indexing",
    "Authentication & authorization",
    "Caching strategies",
    "Node.js event loop & async patterns",
    "Error handling & logging",
    "SQL vs NoSQL tradeoffs",
    "Microservices vs monolith",
  ],
  "Full-stack": [
    "System design fundamentals",
    "API versioning & backward compatibility",
    "Client-server data flow",
    "Deployment & CI/CD basics",
    "OWASP top 10 security basics",
    "Scalability patterns",
    "Client/server state synchronization",
    "Monorepo vs polyrepo tradeoffs",
  ],
  "AI Engineering": [
    "LLM prompting fundamentals",
    "RAG architecture",
    "Embeddings & vector search",
    "Fine-tuning vs prompting",
    "Evaluating LLM outputs",
    "Context window & token management",
    "Agent/tool-use patterns",
    "Latency/cost tradeoffs in LLM apps",
  ],
};

async function seedUser(email: string | undefined, password: string | undefined, label: string) {
  if (!email || !password) {
    console.warn(`Skipping ${label}: set its email/password env vars in server/.env`);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });
  console.log(`Seeded user: ${email}`);
}

async function seedTopics() {
  for (const track of Object.keys(STARTER_TOPICS)) {
    for (const name of STARTER_TOPICS[track]) {
      await prisma.topic.upsert({
        where: { name_track: { name, track } },
        update: {},
        create: { name, track, isCustom: false },
      });
    }
  }
  console.log("Seeded starter topics.");
}

async function seedCourses() {
  for (const def of COURSES) {
    const fields = { title: def.title, subject: def.subject, description: def.description, published: def.published ?? true };
    const course = await prisma.course.upsert({
      where: { slug: def.slug },
      update: fields,
      create: { slug: def.slug, ...fields },
    });
    for (const [i, level] of def.levels.entries()) {
      const order = i + 1;
      const levelFields = {
        title: level.title,
        editor: level.editor,
        concepts: JSON.stringify(level.concepts),
        toolbox: JSON.stringify(level.toolbox ?? []),
        challengesToPass: level.challengesToPass ?? 3,
      };
      await prisma.courseLevel.upsert({
        where: { courseId_order: { courseId: course.id, order } },
        update: levelFields,
        create: { courseId: course.id, order, ...levelFields },
      });
    }
    await prisma.courseLevel.deleteMany({ where: { courseId: course.id, order: { gt: def.levels.length } } });
    // Learners on a level that no longer exists move to the new last level.
    await prisma.enrollment.updateMany({
      where: { courseId: course.id, currentLevel: { gt: def.levels.length } },
      data: { currentLevel: def.levels.length, passedAtLevel: 0 },
    });
  }
  console.log(`Seeded ${COURSES.length} kids course(s).`);
}

async function main() {
  await seedUser(process.env.SEED_USER_1_EMAIL, process.env.SEED_USER_1_PASSWORD, "user 1");
  await seedUser(process.env.SEED_USER_2_EMAIL, process.env.SEED_USER_2_PASSWORD, "user 2");
  await seedTopics();
  await seedCourses();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
