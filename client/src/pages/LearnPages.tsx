import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { learnApi } from "../api/learn";
import { LessonContent } from "../components/LessonContent";
import { LearnQuestionCard } from "../components/LearnQuestionCard";
import { Difficulty, LEVEL_LABELS, LearnCourse, LearnCourseSummary, LearnLesson, ReviewItem } from "../types";

const LEVELS: Difficulty[] = ["JUNIOR", "INTERMEDIATE", "SENIOR"];
const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p className="error-text" role="alert">
      {error}
    </p>
  ) : null;
}

// /learn: your courses, the review queue, and "learn anything".
export function LearnPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<LearnCourseSummary[] | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<Difficulty>("INTERMEDIATE");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    learnApi
      .list()
      .then((res) => {
        setCourses(res.courses);
        setDueCount(res.dueCount);
      })
      .catch((err) => setError(errorMessage(err, "Couldn't load your courses")));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { course } = await learnApi.createForTopic(topic.trim(), level);
      navigate(`/learn/courses/${course.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the course. Try again."));
      setCreating(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Learn</h1>
      <p className="page-subtitle">Short courses with practice questions. Anything you get wrong comes back for review until it sticks.</p>

      <section className={`card review-callout ${dueCount ? "has-due" : ""}`} aria-labelledby="review-callout-title">
        <h2 id="review-callout-title" className="card-title">
          Review
        </h2>
        {dueCount > 0 ? (
          <>
            <p>
              {dueCount} question{dueCount === 1 ? " is" : "s are"} ready to review.
            </p>
            <Link to="/learn/review" className="btn btn-primary">
              Start review
            </Link>
          </>
        ) : (
          <p className="helper-text">Nothing to review right now. Questions you miss in a lesson show up here the next day.</p>
        )}
      </section>

      <section className="card" aria-labelledby="new-course-title">
        <h2 id="new-course-title" className="card-title">
          Learn anything
        </h2>
        <p className="helper-text">For skills in your target role, use the "Learn" buttons on the home page or the skills page.</p>
        <form onSubmit={handleCreate}>
          <div className="field">
            <label htmlFor="learn-topic">Topic</label>
            <input
              id="learn-topic"
              className="input"
              required
              minLength={2}
              maxLength={120}
              placeholder="e.g. SQL window functions, negotiation, Kubernetes basics"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="field">
            <span className="field-label" id="learn-level-label">
              Level
            </span>
            <div className="segmented" role="group" aria-labelledby="learn-level-label">
              {LEVELS.map((l) => (
                <button key={l} type="button" className={`segmented-option ${level === l ? "active" : ""}`} aria-pressed={level === l} onClick={() => setLevel(l)}>
                  {LEVEL_LABELS[l]}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={creating || topic.trim().length < 2}>
            {creating ? "Planning your course…" : "Create course"}
          </button>
        </form>
      </section>

      <ErrorText error={error} />

      <section aria-labelledby="my-courses-title">
        <h2 id="my-courses-title" className="card-title">
          Your courses
        </h2>
        {!courses && !error && <p className="helper-text">Loading…</p>}
        {courses?.length === 0 && <p className="helper-text">No courses yet.</p>}
        {courses && courses.length > 0 && (
          <ul className="course-list">
            {courses.map((c) => (
              <li key={c.id}>
                <Link to={`/learn/courses/${c.id}`} className="card course-item">
                  <span className="course-item-title">{c.title}</span>
                  <span className="helper-text">
                    {LEVEL_LABELS[c.level]} · {c.completedCount} of {c.lessonCount} lessons done
                  </span>
                  <span className="skill-bar" aria-hidden="true">
                    <span style={{ width: `${(c.completedCount / Math.max(1, c.lessonCount)) * 100}%` }} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// /learn/courses/:id
export function LearnCoursePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState<LearnCourse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    learnApi
      .course(id)
      .then((res) => setCourse(res.course))
      .catch((err) => setError(errorMessage(err, "Couldn't load this course")));
  }, [id]);

  async function remove() {
    if (!course || !window.confirm(`Delete "${course.title}" and its review questions?`)) return;
    try {
      await learnApi.remove(course.id);
      navigate("/learn");
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete the course"));
    }
  }

  if (!course) {
    return <div className="page">{error ? <ErrorText error={error} /> : <p className="helper-text">Loading…</p>}</div>;
  }

  const next = course.lessons.find((l) => !l.completed) ?? course.lessons[0];
  const done = course.lessons.filter((l) => l.completed).length;

  return (
    <div className="page">
      <Link to="/learn" className="btn-link btn-link-inline">
        ← Learn
      </Link>
      <h1 className="page-title">{course.title}</h1>
      <p className="page-subtitle">
        {course.summary}
        {course.skill && ` For your ${course.skill.roleTitle} role (${course.skill.name}).`}
      </p>
      <div className="course-actions">
        <Link to={`/learn/lessons/${next.id}`} className="btn btn-primary">
          {done === 0 ? "Start the course" : done === course.lessons.length ? "Go over it again" : `Continue: lesson ${next.order}`}
        </Link>
        <button type="button" className="btn btn-danger" onClick={remove}>
          Delete course
        </button>
      </div>
      <ErrorText error={error} />
      <ol className="lesson-list">
        {course.lessons.map((l) => (
          <li key={l.id}>
            <Link to={`/learn/lessons/${l.id}`} className={`card lesson-item ${l.completed ? "is-done" : ""}`}>
              <span className="lesson-number" aria-hidden="true">
                {l.completed ? "✓" : l.order}
              </span>
              <span>
                <span className="lesson-item-title">
                  {l.title}
                  {l.completed && <span className="visually-hidden"> (done)</span>}
                </span>
                <span className="helper-text">{l.objective}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

// One shared request per lesson while it's being written, so React StrictMode's double effect (and quick
// re-visits) don't ask the AI to write the same lesson twice.
const writing = new Map<string, Promise<void>>();
function writeLessonOnce(id: string) {
  if (!writing.has(id)) writing.set(id, learnApi.writeLesson(id).finally(() => writing.delete(id)));
  return writing.get(id)!;
}

// /learn/lessons/:id. The lesson is written by the AI the first time it's opened.
export function LearnLessonPage() {
  const { id = "" } = useParams();
  const [lesson, setLesson] = useState<LearnLesson | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  // `isCurrent` lets a slow load for a lesson the user has already left be ignored instead of overwriting the page.
  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      setError(null);
      try {
        let { lesson } = await learnApi.lesson(id);
        if (lesson.content == null) {
          if (isCurrent()) setIsWriting(true);
          await writeLessonOnce(id);
          ({ lesson } = await learnApi.lesson(id));
        }
        if (!isCurrent()) return;
        setLesson(lesson);
        setComplete(lesson.completed);
      } catch (err) {
        if (isCurrent()) setError(errorMessage(err, "Couldn't load this lesson. Try again."));
      } finally {
        if (isCurrent()) setIsWriting(false);
      }
    },
    [id]
  );

  useEffect(() => {
    let current = true;
    setLesson(null);
    load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  if (!lesson) {
    return (
      <div className="page page-narrow">
        <ErrorText error={error} />
        {error ? (
          <button type="button" className="btn btn-secondary" onClick={() => load()}>
            Try again
          </button>
        ) : (
          <p className="helper-text" role="status">
            {isWriting ? "Writing your lesson…" : "Loading…"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <Link to={`/learn/courses/${lesson.course.id}`} className="btn-link btn-link-inline">
        ← {lesson.course.title}
      </Link>
      <p className="lesson-eyebrow">
        Lesson {lesson.order} of {lesson.course.lessonCount}
      </p>
      <h1 className="page-title">{lesson.title}</h1>
      <p className="page-subtitle">{lesson.objective}</p>

      <article className="card">
        <LessonContent text={lesson.content ?? ""} />
      </article>

      <section aria-labelledby="check-title">
        <h2 id="check-title" className="card-title">
          Check your understanding
        </h2>
        {lesson.questions.map((q, i) => (
          <LearnQuestionCard key={q.id} question={q} number={i + 1} onAnswered={(r) => r.lessonComplete && setComplete(true)} />
        ))}
      </section>

      <div role="status" className="lesson-footer">
        {complete && (
          <p>
            <strong>Lesson complete.</strong>
          </p>
        )}
        {lesson.nextLessonId ? (
          <Link to={`/learn/lessons/${lesson.nextLessonId}`} className="btn btn-primary">
            Next lesson
          </Link>
        ) : (
          <Link to={`/learn/courses/${lesson.course.id}`} className="btn btn-primary">
            Back to the course
          </Link>
        )}
      </div>
    </div>
  );
}

// /learn/review: questions due for spaced repetition, one batch at a time.
export function LearnReviewPage() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    learnApi
      .review()
      .then((res) => setItems(res.items))
      .catch((err) => setError(errorMessage(err, "Couldn't load your review")));
  }, []);

  if (!items) {
    return <div className="page page-narrow">{error ? <ErrorText error={error} /> : <p className="helper-text">Loading…</p>}</div>;
  }

  const item = items[index];
  return (
    <div className="page page-narrow">
      <Link to="/learn" className="btn-link btn-link-inline">
        ← Learn
      </Link>
      <h1 className="page-title">Review</h1>
      {!item ? (
        <div className="card" role="status">
          <p>{items.length ? "All done for now. Nice work!" : "Nothing to review right now."}</p>
          <Link to="/learn" className="btn btn-primary">
            Back to Learn
          </Link>
        </div>
      ) : (
        <>
          <p className="page-subtitle">
            {index + 1} of {items.length} · from "{item.lessonTitle}" in {item.course.title}
          </p>
          <LearnQuestionCard key={item.id} question={item.question} number={index + 1} fromReview onAnswered={() => setAnswered(true)} />
          {answered && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setAnswered(false);
                setIndex((i) => i + 1);
              }}
            >
              {index + 1 < items.length ? "Next question" : "Finish"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
