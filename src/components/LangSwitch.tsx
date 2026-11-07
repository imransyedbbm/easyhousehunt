import { Languages } from "lucide-react";
import { LANGS, setLang, useLang } from "@/lib/i18n";

/** EN / ಕನ್ನಡ / हिंदी switch. */
export default function LangSwitch({ className = "" }: { className?: string }) {
  const lang = useLang();
  return (
    <div className={`inline-flex items-center gap-1 rounded-full bg-gray-800/80 p-0.5 text-xs ${className}`} role="group" aria-label="Language">
      <Languages className="ml-1.5 h-3.5 w-3.5 text-gray-400" aria-hidden />
      {LANGS.map((l) => (
        <button key={l.code} lang={l.code}
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          className={`min-h-[28px] min-w-[32px] rounded-full px-2.5 py-1.5 font-medium ${lang === l.code ? "bg-orange-500 text-white" : "text-gray-300 hover:text-white"}`}>
          {l.code === "en" ? "EN" : l.label}
        </button>
      ))}
    </div>
  );
}
