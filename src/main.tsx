import ReactDOM from "react-dom/client";
import App from "./App";
import MessageNotifier from "./components/MessageNotifier";
import SavedSync from "./components/SavedSync";
import { AuthProvider } from "./hooks/useAuth";
import { UserLocationProvider } from "./hooks/useUserLocation";
import { Toaster } from "sonner";
import "./index.css";
import { hydrateWelcome } from "./components/WelcomeIsland";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <UserLocationProvider>
      <App />
      <MessageNotifier />
      <SavedSync />
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </UserLocationProvider>
  </AuthProvider>
);

// First-visit welcome was pre-rendered into the page; take it over in place.
hydrateWelcome();

// Installable app + faster repeat visits (production only).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}
