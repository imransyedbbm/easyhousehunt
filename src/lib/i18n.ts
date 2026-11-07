import { useSyncExternalStore } from "react";

/** Lightweight translations. English text is the key; anything not in a dictionary falls back to English. */
export type Lang = "en" | "kn" | "hi";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "hi", label: "हिंदी" },
];

// Translations reviewed for meaning; have a native speaker proofread before major campaigns.
const KN: Record<string, string> = {
  "Find your next home in Bengaluru.": "ಬೆಂಗಳೂರಿನಲ್ಲಿ ನಿಮ್ಮ ಮುಂದಿನ ಮನೆಯನ್ನು ಹುಡುಕಿ.",
  "No brokers. No brokerage.": "ಬ್ರೋಕರ್ ಇಲ್ಲ. ಬ್ರೋಕರೇಜ್ ಇಲ್ಲ.",
  "Homes, PGs and office spaces listed directly by owners. Browse on the map and chat with the owner yourself.": "ಮಾಲೀಕರೇ ನೇರವಾಗಿ ಹಾಕಿರುವ ಮನೆಗಳು, ಪಿಜಿಗಳು ಮತ್ತು ಕಚೇರಿ ಸ್ಥಳಗಳು. ನಕ್ಷೆಯಲ್ಲಿ ನೋಡಿ, ಮಾಲೀಕರೊಂದಿಗೆ ನೇರವಾಗಿ ಮಾತನಾಡಿ.",
  "Which area? e.g. Koramangala": "ಯಾವ ಏರಿಯಾ? ಉದಾ: ಕೋರಮಂಗಲ",
  "Browse homes on the map": "ನಕ್ಷೆಯಲ್ಲಿ ಮನೆಗಳನ್ನು ನೋಡಿ",
  "I'm an owner · list free": "ನಾನು ಮಾಲೀಕ · ಉಚಿತವಾಗಿ ಹಾಕಿ",
  "Zero brokerage": "ಶೂನ್ಯ ಬ್ರೋಕರೇಜ್",
  "Deal directly with owners. We never charge tenants.": "ಮಾಲೀಕರೊಂದಿಗೆ ನೇರ ವ್ಯವಹಾರ. ಬಾಡಿಗೆದಾರರಿಂದ ಯಾವುದೇ ಶುಲ್ಕವಿಲ್ಲ.",
  "Chat with owners": "ಮಾಲೀಕರೊಂದಿಗೆ ಚಾಟ್",
  "Message the owner in the app. No number-sharing needed.": "ಆ್ಯಪ್‌ನಲ್ಲೇ ಮಾಲೀಕರಿಗೆ ಸಂದೇಶ ಕಳುಹಿಸಿ. ನಂಬರ್ ಹಂಚಿಕೊಳ್ಳುವ ಅಗತ್ಯವಿಲ್ಲ.",
  "Get alerted": "ಅಲರ್ಟ್ ಪಡೆಯಿರಿ",
  "Post what you need and we'll email you when it's listed.": "ನಿಮಗೆ ಬೇಕಾದುದನ್ನು ತಿಳಿಸಿ, ಸಿಕ್ಕಾಗ ನಾವು ಇಮೇಲ್ ಮಾಡುತ್ತೇವೆ.",
  "Browse by area": "ಏರಿಯಾ ಪ್ರಕಾರ ನೋಡಿ",
  "About": "ನಮ್ಮ ಬಗ್ಗೆ",
  "List Your Property": "ನಿಮ್ಮ ಆಸ್ತಿ ಹಾಕಿ",
  "Post Requirement": "ಅವಶ್ಯಕತೆ ತಿಳಿಸಿ",
  "List": "ಹಾಕಿ",
  "Requirement": "ಅವಶ್ಯಕತೆ",
  "Sign in": "ಸೈನ್ ಇನ್",
  "All": "ಎಲ್ಲಾ",
  "Homes": "ಮನೆಗಳು",
  "Commercial": "ವಾಣಿಜ್ಯ",
  "Search area or apartment name…": "ಏರಿಯಾ ಅಥವಾ ಅಪಾರ್ಟ್‌ಮೆಂಟ್ ಹೆಸರು ಹುಡುಕಿ…",
  "Filters": "ಫಿಲ್ಟರ್‌ಗಳು",
  "Near me": "ನನ್ನ ಹತ್ತಿರ",
  "Connect with Owner": "ಮಾಲೀಕರನ್ನು ಸಂಪರ್ಕಿಸಿ",
  "Contact the seller": "ಮಾರಾಟಗಾರರನ್ನು ಸಂಪರ್ಕಿಸಿ",
  "Login to Connect": "ಸಂಪರ್ಕಿಸಲು ಲಾಗಿನ್ ಮಾಡಿ",
  "Schedule a visit": "ಮನೆ ನೋಡಲು ಸಮಯ ನಿಗದಿ ಮಾಡಿ",
  "Share": "ಹಂಚಿಕೊಳ್ಳಿ",
  "Report this listing": "ಈ ಜಾಹೀರಾತನ್ನು ವರದಿ ಮಾಡಿ",
  "New this week": "ಈ ವಾರ ಹೊಸದು",
  "Verified owner": "ಪರಿಶೀಲಿತ ಮಾಲೀಕ",
  "Language": "ಭಾಷೆ",
  // Listing form
  "List your property": "ನಿಮ್ಮ ಆಸ್ತಿ ಹಾಕಿ",
  "I want to *": "ನಾನು ಬಯಸುವುದು *",
  "Property Type *": "ಆಸ್ತಿಯ ವಿಧ *",
  "Listing Title *": "ಜಾಹೀರಾತಿನ ಶೀರ್ಷಿಕೆ *",
  "Monthly Rent (₹) *": "ತಿಂಗಳ ಬಾಡಿಗೆ (₹) *",
  "Asking price (₹) *": "ಮಾರಾಟ ಬೆಲೆ (₹) *",
  "Deposit (₹)": "ಠೇವಣಿ (₹)",
  "Occupancy *": "ಹಂಚಿಕೆ *",
  "BHK *": "BHK *",
  "Furnishing": "ಫರ್ನಿಶಿಂಗ್",
  "Available from": "ಲಭ್ಯವಿರುವ ದಿನಾಂಕ",
  "Description": "ವಿವರಣೆ",
  "Write it for me": "ನನಗಾಗಿ ಬರೆಯಿರಿ",
  "Polish with AI": "AI ಮೂಲಕ ಸುಧಾರಿಸಿ",
  "Select all that apply": "ಅನ್ವಯಿಸುವ ಎಲ್ಲವನ್ನೂ ಆಯ್ಕೆಮಾಡಿ",
  "Cancel": "ರದ್ದುಮಾಡಿ",
  "← Back": "← ಹಿಂದೆ",
  "Next →": "ಮುಂದೆ →",
  "🏠 Submit for review": "🏠 ಪರಿಶೀಲನೆಗೆ ಸಲ್ಲಿಸಿ",
  "Add a photo to continue": "ಮುಂದುವರಿಯಲು ಫೋಟೋ ಸೇರಿಸಿ",
  "Listing strength": "ಜಾಹೀರಾತಿನ ಗುಣಮಟ್ಟ",
  "Install app": "ಆ್ಯಪ್ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ",
  "Featured": "ವಿಶೇಷ",
  "Show": "ತೋರಿಸಿ",
  "Less": "ಕಡಿಮೆ",
  "Finding homes…": "ಮನೆಗಳನ್ನು ಹುಡುಕುತ್ತಿದೆ…",
  "Finding homes near you…": "ನಿಮ್ಮ ಹತ್ತಿರದ ಮನೆಗಳನ್ನು ಹುಡುಕುತ್ತಿದೆ…",
};

const HI: Record<string, string> = {
  "Find your next home in Bengaluru.": "बेंगलुरु में अपना अगला घर खोजें।",
  "No brokers. No brokerage.": "न ब्रोकर, न ब्रोकरेज।",
  "Homes, PGs and office spaces listed directly by owners. Browse on the map and chat with the owner yourself.": "मालिकों द्वारा सीधे डाले गए घर, पीजी और ऑफिस स्पेस। मैप पर देखें और मालिक से खुद बात करें।",
  "Which area? e.g. Koramangala": "कौन सा इलाका? जैसे कोरमंगला",
  "Browse homes on the map": "मैप पर घर देखें",
  "I'm an owner · list free": "मैं मालिक हूँ · मुफ़्त में डालें",
  "Zero brokerage": "ज़ीरो ब्रोकरेज",
  "Deal directly with owners. We never charge tenants.": "मालिकों से सीधा सौदा। किरायेदारों से कोई शुल्क नहीं।",
  "Chat with owners": "मालिकों से चैट करें",
  "Message the owner in the app. No number-sharing needed.": "ऐप में ही मालिक को मैसेज करें। नंबर देने की ज़रूरत नहीं।",
  "Get alerted": "अलर्ट पाएँ",
  "Post what you need and we'll email you when it's listed.": "अपनी ज़रूरत बताएँ, मिलते ही हम आपको ईमेल करेंगे।",
  "Browse by area": "इलाके के हिसाब से देखें",
  "About": "हमारे बारे में",
  "List Your Property": "अपनी प्रॉपर्टी डालें",
  "Post Requirement": "ज़रूरत बताएँ",
  "List": "डालें",
  "Requirement": "ज़रूरत",
  "Sign in": "साइन इन",
  "All": "सभी",
  "Homes": "घर",
  "Commercial": "कमर्शियल",
  "Search area or apartment name…": "इलाका या अपार्टमेंट का नाम खोजें…",
  "Filters": "फ़िल्टर",
  "Near me": "मेरे पास",
  "Connect with Owner": "मालिक से संपर्क करें",
  "Contact the seller": "विक्रेता से संपर्क करें",
  "Login to Connect": "संपर्क के लिए लॉगिन करें",
  "Schedule a visit": "घर देखने का समय तय करें",
  "Share": "शेयर करें",
  "Report this listing": "इस लिस्टिंग की शिकायत करें",
  "New this week": "इस हफ़्ते नया",
  "Verified owner": "सत्यापित मालिक",
  "Language": "भाषा",
  "List your property": "अपनी प्रॉपर्टी डालें",
  "I want to *": "मैं चाहता/चाहती हूँ *",
  "Property Type *": "प्रॉपर्टी का प्रकार *",
  "Listing Title *": "लिस्टिंग का शीर्षक *",
  "Monthly Rent (₹) *": "मासिक किराया (₹) *",
  "Asking price (₹) *": "माँगी गई कीमत (₹) *",
  "Deposit (₹)": "डिपॉज़िट (₹)",
  "Occupancy *": "शेयरिंग *",
  "BHK *": "BHK *",
  "Furnishing": "फ़र्निशिंग",
  "Available from": "कब से उपलब्ध",
  "Description": "विवरण",
  "Write it for me": "मेरे लिए लिखें",
  "Polish with AI": "AI से बेहतर बनाएँ",
  "Select all that apply": "जो लागू हों, सब चुनें",
  "Cancel": "रद्द करें",
  "← Back": "← पीछे",
  "Next →": "आगे →",
  "🏠 Submit for review": "🏠 जाँच के लिए भेजें",
  "Add a photo to continue": "आगे बढ़ने के लिए फ़ोटो जोड़ें",
  "Listing strength": "लिस्टिंग की मज़बूती",
  "Install app": "ऐप इंस्टॉल करें",
  "Featured": "फ़ीचर्ड",
  "Show": "दिखाएँ",
  "Less": "कम",
  "Finding homes…": "घर खोज रहे हैं…",
  "Finding homes near you…": "आपके पास के घर खोज रहे हैं…",
};

const DICTS: Record<Lang, Record<string, string>> = { en: {}, kn: KN, hi: HI };
const KEY = "ehh_lang";
let current: Lang = (() => {
  try { const v = localStorage.getItem(KEY) as Lang | null; if (v && v in DICTS) return v; } catch { /* ignore */ }
  return "en";
})();
const subs = new Set<() => void>();
const apply = () => { if (typeof document !== "undefined") document.documentElement.lang = current === "en" ? "en-IN" : current; };
apply();

export function setLang(l: Lang) {
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  apply();
  subs.forEach((f) => f());
}
export const getLang = () => current;
export const translate = (s: string) => DICTS[current][s] ?? s;
export const _dicts = DICTS; // for tests

/** Re-renders on language change. Usage: const t = useT(); t("Filters") */
export function useT() {
  useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => current, () => "en");
  return translate;
}
export function useLang() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => current, () => "en" as Lang);
}
