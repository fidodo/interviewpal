import { lazy, ReactElement, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HistoryPage } from "./pages/HistoryPage";
import { InterviewSessionPage } from "./pages/InterviewSessionPage";
import { SummaryPage } from "./pages/SummaryPage";
import { AccountPage } from "./pages/AccountPage";
import { RolesPage } from "./pages/RolesPage";
import { RoleFormPage } from "./pages/RoleFormPage";
import { RoleSkillsPage } from "./pages/RoleSkillsPage";
import { LearnCoursePage, LearnLessonPage, LearnPage, LearnReviewPage } from "./pages/LearnPages";
import { DebugChallengePage, DebugPage } from "./pages/DebugPages";
import { DesignChallengePage, DesignPage } from "./pages/DesignPages";
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./pages/EmailLinkPages";
import { getKidLock, kidHomePath } from "./kids/kidMode";

// The kids section is its own lazy chunk (Blockly, CodeMirror, the Python runner) with its own layout.
const KidsApp = lazy(() => import("./kids/KidsApp"));
// RAG Lab pulls in CodeMirror and the bot runtimes, so it's its own chunk too.
const RagLabHomePage = lazy(() => import("./raglab/RagLabPages").then((m) => ({ default: m.RagLabHomePage })));
const SpeakHomePage = lazy(() => import("./story/StoryPages").then((m) => ({ default: m.SpeakHomePage })));
const StoryPage = lazy(() => import("./story/StoryPages").then((m) => ({ default: m.StoryPage })));
const RagLabProjectPage = lazy(() => import("./raglab/RagLabPages").then((m) => ({ default: m.RagLabProjectPage })));

function Loading() {
  return (
    <div className="page">
      <p className="helper-text">Loading…</p>
    </div>
  );
}

function ProtectedRoute({ children, allowKidMode = false }: { children: ReactElement; allowKidMode?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  // While a child is using the kids section, keep them out of the interview pages.
  const lock = allowKidMode ? null : getKidLock(user.id);
  if (lock) return <Navigate to={kidHomePath(lock)} replace />;
  return children;
}

function InterviewRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route
          path="/roles"
          element={
            <ProtectedRoute>
              <RolesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/roles/new"
          element={
            <ProtectedRoute>
              <RoleFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/roles/:id/edit"
          element={
            <ProtectedRoute>
              <RoleFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/roles/:id/skills"
          element={
            <ProtectedRoute>
              <RoleSkillsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/learn"
          element={
            <ProtectedRoute>
              <LearnPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/learn/courses/:id"
          element={
            <ProtectedRoute>
              <LearnCoursePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/learn/lessons/:id"
          element={
            <ProtectedRoute>
              <LearnLessonPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/learn/review"
          element={
            <ProtectedRoute>
              <LearnReviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/debug"
          element={
            <ProtectedRoute>
              <DebugPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/debug/:id"
          element={
            <ProtectedRoute>
              <DebugChallengePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/design"
          element={
            <ProtectedRoute>
              <DesignPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/design/:id"
          element={
            <ProtectedRoute>
              <DesignChallengePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/speak"
          element={
            <ProtectedRoute>
              <Suspense fallback={<Loading />}>
                <SpeakHomePage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/speak/:id"
          element={
            <ProtectedRoute>
              <Suspense fallback={<Loading />}>
                <StoryPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/rag-lab"
          element={
            <ProtectedRoute>
              <Suspense fallback={<Loading />}>
                <RagLabHomePage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/rag-lab/:id"
          element={
            <ProtectedRoute>
              <Suspense fallback={<Loading />}>
                <RagLabProjectPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <AccountPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sessions/:id"
          element={
            <ProtectedRoute>
              <InterviewSessionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sessions/:id/summary"
          element={
            <ProtectedRoute>
              <SummaryPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <Routes>
      <Route
        path="/kids/*"
        element={
          <ProtectedRoute allowKidMode>
            <Suspense fallback={<Loading />}>
              <KidsApp />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<InterviewRoutes />} />
    </Routes>
  );
}
