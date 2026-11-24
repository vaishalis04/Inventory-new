import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import App from "./App.jsx";
import "./index.css";
import "./App.css";
import "./styles/theme-light.css";
import "./styles/components.css";
import "./styles/pages.css";
import "./styles/login.css";
import "./styles/history.css";
import "./styles/toast.css";
import "./styles/mobile.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);