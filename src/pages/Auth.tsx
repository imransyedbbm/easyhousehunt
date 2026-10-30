import { supabase } from "@/integrations/supabase/client";

export default function Auth() {

  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // ✅ THIS IS THE KEY FIX
        redirectTo: window.location.origin,
      },
    });
  };

  return (
    <div className="h-screen flex items-center justify-center bg-[#020617] text-white">

      <div className="bg-[#0f172a] p-8 rounded-xl w-[400px] text-center shadow-lg">

        <h1 className="text-2xl font-bold mb-6">
          Welcome to EasyHouseHunt
        </h1>

        <button
          onClick={loginWithGoogle}
          className="bg-white text-black px-6 py-3 rounded w-full font-semibold hover:bg-gray-200 transition"
        >
          Continue with Google
        </button>

        <p className="text-gray-400 mt-4 text-sm">
          Login to list your property
        </p>

      </div>
    </div>
  );
}