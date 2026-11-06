import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Today, TodayItem } from "./types";
import { WeekRing } from "./WeekRing";

function ItemLink({ item }: { item: TodayItem }) {
  const label = (
    <>
      {item.title}
      {item.done && <span className="visually-hidden"> (done)</span>}
    </>
  );
  // "#quick-practice" is the form further down the dashboard.
  if (item.link.startsWith("#")) {
    return (
      <a
        href={item.link}
        className="today-item-title"
        onClick={(e) => {
          const target = document.getElementById(item.link.slice(1));
          if (!target) return;
          e.preventDefault();
          target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
          target.focus({ preventScroll: true });
        }}
      >
        {label}
      </a>
    );
  }
  return (
    <Link to={item.link} className="today-item-title">
      {label}
    </Link>
  );
}

// The dashboard's daily plan: about 10 minutes of practice, the streak and the weekly goal.
export function TodayCard() {
  const [today, setToday] = useState<Today | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Today>("/today")
      .then((t) => !cancelled && setToday(t))
      .catch(() => {
        // Not essential to the dashboard; leave it out.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!today) return null;
  const { streak, week, items } = today;
  const left = items.filter((i) => !i.done);
  const minutes = left.reduce((n, i) => n + i.minutes, 0);
  const earned = today.badges.filter((b) => b.earnedAt).length;

  return (
    <section className="card today-card" aria-labelledby="today-title">
      <div className="today-head">
        <div>
          <h2 id="today-title" className="card-title">
            Today
          </h2>
          <p className="helper-text">
            {left.length === 0
              ? "All done for today. Nice work."
              : `About ${minutes} minute${minutes === 1 ? "" : "s"}${items.length > left.length ? `, ${items.length - left.length} of ${items.length} done` : ""}.`}
          </p>
        </div>
        <div className="today-stats">
          <dl className="today-streak">
            <div>
              <dt>Streak</dt>
              <dd>
                {streak.current} day{streak.current === 1 ? "" : "s"}
              </dd>
            </div>
            <div>
              <dt>Best</dt>
              <dd>
                {streak.best} day{streak.best === 1 ? "" : "s"}
              </dd>
            </div>
          </dl>
          <div className="today-week">
            <WeekRing practised={week.practised} goal={week.goal} />
            <span className="helper-text">This week</span>
          </div>
        </div>
      </div>

      {streak.atRisk && (
        <p className="today-note" role="note">
          You missed yesterday. Practise today and a freeze day keeps your {streak.current}-day streak.
        </p>
      )}
      {!streak.atRisk && streak.freezeUsedThisWeek && <p className="helper-text">This week's freeze day covered a missed day, so your streak is safe.</p>}

      <ol className="today-list">
        {items.map((item) => (
          <li key={item.key} className={`today-item ${item.done ? "done" : ""}`}>
            <span className="today-check" aria-hidden="true">
              {item.done ? "✓" : ""}
            </span>
            <div className="today-item-body">
              <ItemLink item={item} />
              <span className="helper-text">{item.detail}</span>
            </div>
            <span className="today-min">{item.done ? "Done" : `${item.minutes} min`}</span>
          </li>
        ))}
      </ol>

      <p className="helper-text today-foot">
        Practise on {week.goal} days a week to meet your goal. One missed day a week won't break your streak.{" "}
        <Link to="/progress#badges">
          {earned ? `Your badges (${earned})` : "See the badges you can earn"}
        </Link>
      </p>
    </section>
  );
}
