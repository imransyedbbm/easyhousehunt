import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export default function AuthModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid email address");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: value,
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-[320px] text-center shadow-xl">
        <h2 className="text-lg font-semibold mb-4">
          Please login to continue
        </h2>

        <button
          onClick={signInWithGoogle}
          className="w-full bg-red-500 hover:bg-red-600 text-white py-2 rounded mb-3"
        >
          Continue with Google
        </button>

        <div className="flex items-center gap-2 my-3 text-xs text-gray-400">
          <span className="flex-1 h-px bg-gray-200" />or<span className="flex-1 h-px bg-gray-200" />
        </div>

        {sent ? (
          <p className="text-sm text-green-700 bg-green-50 rounded p-3 mb-3">
            Check <b>{email.trim()}</b> for a sign-in link.
          </p>
        ) : (
          <form onSubmit={sendMagicLink} className="mb-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-gray-300 rounded px-3 py-2 mb-2 text-sm text-black"
              autoComplete="email"
            />
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
            <button
              type="submit"
              disabled={sending}
              className="w-full bg-gray-900 hover:bg-black disabled:opacity-60 text-white py-2 rounded"
            >
              {sending ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>
        )}

        <p className="text-xs text-gray-500 mb-3">
          By continuing, you agree to our{" "}
          <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-orange-600 underline">Terms of Use</a>{" "}
          and{" "}
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="text-orange-600 underline">Privacy Policy</a>.
        </p>

        <button
          onClick={onClose}
          className="text-gray-500 text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}