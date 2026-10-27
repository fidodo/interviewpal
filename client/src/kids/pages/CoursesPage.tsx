import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { kidsApi } from "../api";
import { AvatarIcon } from "../components/bits";
import { Child, Course } from "../types";

// Shown so learners (and parents) can see the section will grow; real courses come from the server.
const COMING_SOON = [
  { title: "Maths quests", emoji: "🧮" },
  { title: "Making videos", emoji: "🎬" },
];

const SUBJECT_EMOJI: Record<string, string> = { Coding: "🐢" };

export function CoursesPage() {
  const { childId } = useParams();
  const [child, setChild] = useState<Child | null>(null);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([kidsApi.listChildren(), kidsApi.listCourses()])
      .then(([kids, list]) => {
        const found = kids.children.find((c) => c.id === childId) ?? null;
        if (!found) setError("We couldn't find this learner.");
        setChild(found);
        setCourses(list.courses);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load courses"));
  }, [childId]);

  return (
    <div className="kids-page">
      {child && (
        <div className="kids-hello">
          <AvatarIcon avatar={child.avatar} size="lg" />
          <div>
            <h1 className="kids-title">Hi, {child.displayName}!</h1>
            <p className="kids-subtitle">What do you want to learn today?</p>
          </div>
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!courses && !error && <p className="helper-text">Loading…</p>}
      {child && courses && (
        <ul className="course-grid" aria-label="Courses">
          {courses.map((course) => (
            <li key={course.slug}>
              <Link to={`/kids/learn/${child.id}/${course.slug}`} className="course-card">
                <span className="course-emoji" aria-hidden="true">
                  {SUBJECT_EMOJI[course.subject] ?? "⭐"}
                </span>
                <span className="course-title">{course.title}</span>
                <span className="course-desc">{course.description}</span>
                <span className="course-meta">{course.levelCount} levels</span>
              </Link>
            </li>
          ))}
          {COMING_SOON.map((c) => (
            <li key={c.title}>
              <div className="course-card course-card-soon">
                <span className="course-emoji" aria-hidden="true">
                  {c.emoji}
                </span>
                <span className="course-title">{c.title}</span>
                <span className="course-meta">Coming soon</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
