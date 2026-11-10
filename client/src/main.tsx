import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./hooks/AuthProvider";
import { App } from "./App";
import { PageErrorBoundary } from "./components/PageErrorBoundary";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PageErrorBoundary>
          <App />
        </PageErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
