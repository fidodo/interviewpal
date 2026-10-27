import { CourseDefinition } from "./types";
import { codingPython } from "./coding-python";

// To add a course: write a CourseDefinition in this folder, list it here, and run `npm run prisma:seed`.
export const COURSES: CourseDefinition[] = [codingPython];
