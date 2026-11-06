import ReactDOM from "react-dom/client";
import App from "./App";
import MessageNotifier from "./components/MessageNotifier";
import SavedSync from "./components/SavedSync";
import { AuthProvider } from "./hooks/useAuth";
import { UserLocationProvider } from "./hooks/useUserLocation";
import { Toaster } from "sonner";
import "./index.css";

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
