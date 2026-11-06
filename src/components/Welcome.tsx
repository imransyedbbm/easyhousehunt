import LangSwitch from "@/components/LangSwitch";
import { useT, getLang } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { Search, MapPin, ShieldCheck, MessageCircle, BellRing, ArrowRight, X } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { LOCALITIES, type Locality } from "@/data/localities";

const POPULAR = ["Koramangala", "HSR Layout", "Indiranagar", "Whitefield", "Bellandur", "Marathahalli", "Electronic City", "Hebbal", "JP Nagar", "BTM Layout"];
const KEY = "ehh_welcomed_v1";

export function shouldShowWelcome(): boolean {
  const q = new URLSearchParams(window.location.search);
  if (["p", "area", "list", "requirement", "segment", "open"].some((k) => q.has(k))) return false;
  try { return !localStorage.getItem(KEY); } catch { return true; }
}

/** First-visit landing over the map: what the site is, quick area search, and the two main actions. */
export default function Welcome({
  listingCount,
  onPickArea,
  onBrowse,
  onListProperty,
}: {
  listingCount: number;
  onPickArea: (l: Locality) => void;
  onBrowse: () => void;
  onListProperty: () => void;
}) {
  const [q, setQ] = useState("");
  const t = useT();

  const done = (fn: () => void) => { try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ } fn(); };
  const popular = useMemo(() => POPULAR.map((n) => LOCALITIES.find((l) => l.name === n)).filter(Boolean) as Locality[], []);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return LOCALITIES.filter((l) => l.name.toLowerCase().includes(s) || l.aliases?.some((a) => a.toLowerCase().includes(s))).slice(0, 6);
  }, [q]);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/70 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Welcome to EasyHouseHunt">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-4 py-10">
        <div className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-gray-900 to-gray-950 p-6 shadow-2xl sm:p-10">
          <button onClick={() => done(onBrowse)} aria-label="Close" className="absolute right-4 top-4 rounded-full p-2 text-gray-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
          <BrandLogo size="md" />
          <LangSwitch className="mt-4" />
          <h1 className="mt-6 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            {t("Find your next home in Bengaluru.")}<br />
            <span className="text-orange-400">{t("No brokers. No brokerage.")}</span>
          </h1>
          <p className="mt-3 text-gray-400">
            {t("Homes, PGs and office spaces listed directly by owners. Browse on the map and chat with the owner yourself.")}
          </p>

          <div className="relative mt-6">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
            <input
              autoFocus={window.innerWidth >= 768}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) done(() => onPickArea(matches[0])); }}
              placeholder={t("Which area? e.g. Koramangala")}
              aria-label="Search by area"
              className="w-full rounded-2xl border border-gray-700 bg-gray-800/80 py-4 pl-12 pr-4 text-base text-white placeholder-gray-500 outline-none focus:border-orange-500"
            />
            {matches.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-xl">
                {matches.map((l) => (
                  <li key={l.name}>
                    <button onClick={() => done(() => onPickArea(l))} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-white hover:bg-gray-800">
                      <MapPin className="h-4 w-4 text-orange-400" /> {l.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {popular.map((l) => (
              <button key={l.name} onClick={() => done(() => onPickArea(l))}
                className="rounded-full border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-sm text-gray-200 hover:border-orange-500 hover:text-white">
                {l.name}
              </button>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button onClick={() => done(onBrowse)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3.5 font-semibold text-white hover:bg-orange-600">
              {listingCount > 0 && getLang() === "en" ? `Browse ${listingCount} homes on the map` : t("Browse homes on the map")} <ArrowRight className="h-4 w-4" />
            </button>
            <button onClick={() => done(onListProperty)}
              className="flex-1 rounded-2xl border border-gray-600 bg-gray-800 px-5 py-3.5 font-semibold text-white hover:bg-gray-700">
              {t("I'm an owner · list free")}
            </button>
          </div>

          <div className="mt-8 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, t: "Zero brokerage", d: "Deal directly with owners. We never charge tenants." },
              { icon: MessageCircle, t: "Chat with owners", d: "Message the owner in the app. No number-sharing needed." },
              { icon: BellRing, t: "Get alerted", d: "Post what you need and we'll email you when it's listed." },
            ].map(({ icon: Icon, t: title, d }) => (
              <div key={title}>
                <Icon className="h-5 w-5 text-orange-400" />
                <p className="mt-2 text-sm font-semibold text-white">{t(title)}</p>
                <p className="mt-0.5 text-xs text-gray-400">{t(d)}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-gray-500">
            <a href="/rent" className="hover:text-gray-300">{t("Browse by area")}</a> · <a href="/about.html" className="hover:text-gray-300">{t("About")}</a>
          </p>
        </div>
      </div>
    </div>
  );
}
