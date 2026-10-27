import { ReactElement } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { KidsLayout } from "./KidsLayout";
import { getKidLock, kidHomePath } from "./kidMode";
import { KidsHomePage } from "./pages/KidsHomePage";
import { ParentPage } from "./pages/ParentPage";
import { CoursesPage } from "./pages/CoursesPage";
import { LevelMapPage } from "./pages/LevelMapPage";
import { ChallengePage } from "./pages/ChallengePage";
import "./kids.css";

// Grown-up pages are off limits while kid mode is on.
function GrownUpsOnly({ children }: { children: ReactElement }) {
  const { user } = useAuth();
  const lock = user ? getKidLock(user.id) : null;
  return lock ? <Navigate to={kidHomePath(lock)} replace /> : children;
}

// In kid mode, keep the learner on their own pages.
function LockedLearner({ children }: { children: ReactElement }) {
  const { user } = useAuth();
  const { childId } = useParams();
  const lock = user ? getKidLock(user.id) : null;
  return lock && lock !== childId ? <Navigate to={kidHomePath(lock)} replace /> : children;
}

// Lazy-loaded from App.tsx so Blockly, CodeMirror and the Python runner never load for interview pages.
export default function KidsApp() {
  return (
    <KidsLayout>
      <Routes>
        <Route
          index
          element={
            <GrownUpsOnly>
              <KidsHomePage />
            </GrownUpsOnly>
          }
        />
        <Route
          path="parent"
          element={
            <GrownUpsOnly>
              <ParentPage />
            </GrownUpsOnly>
          }
        />
        <Route
          path="learn/:childId"
          element={
            <LockedLearner>
              <CoursesPage />
            </LockedLearner>
          }
        />
        <Route
          path="learn/:childId/:slug"
          element={
            <LockedLearner>
              <LevelMapPage />
            </LockedLearner>
          }
        />
        <Route path="challenge/:id" element={<ChallengePage />} />
        <Route path="*" element={<Navigate to="/kids" replace />} />
      </Routes>
    </KidsLayout>
  );
}
