import { useState } from "react";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import type { Deal } from "@/lib/deals";

async function callGemini(prompt: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("gemini-proxy", {
    body: { prompt },
  });
  if (error) throw error;
  return data.text;
}

type Tab = "generate" | "review";
type Step = 1 | 2 | 3;

interface FormData {
  address: string; propType: string; furnishing: string;
  llName: string; llId: string; llAddress: string;
  tnName: string; tnId: string; tnAddress: string; tnJob: string;
  rent: string; deposit: string; dueDate: string;
  start: string; duration: string; lockin: string;
  maint: string; parking: string; pets: string;
  increment: string; special: string;
}

const defaultForm: FormData = {
  address: "", propType: "2 BHK Apartment", furnishing: "Semi Furnished",
  llName: "", llId: "", llAddress: "",
  tnName: "", tnId: "", tnAddress: "", tnJob: "",
  rent: "", deposit: "", dueDate: "1st of month",
  start: "", duration: "11 months", lockin: "None",
  maint: "Paid by tenant", parking: "1 parking included",
  pets: "Not allowed", increment: "5%", special: "",
};

function prefillFromDeal(deal: Deal | undefined): FormData {
  const p = deal?.properties;
  if (!p) return defaultForm;
  const furnishing = (p.furnishing || "").toLowerCase();
  const typeName = (p.property_type || "apartment").replace(/^\w/, c => c.toUpperCase());
  return {
    ...defaultForm,
    address: [p.title, p.address].filter(Boolean).join(", "),
    propType: p.bhk ? `${p.bhk} BHK ${typeName}` : typeName,
    furnishing: furnishing.startsWith("fully") ? "Fully Furnished"
      : furnishing.startsWith("semi") ? "Semi Furnished"
      : furnishing.startsWith("un") ? "Unfurnished" : defaultForm.furnishing,
    rent: p.rent != null ? String(p.rent) : "",
    deposit: p.deposit != null ? String(p.deposit) : "",
  };
}

export default function RentRight({ onClose, deals, initialDealId }: { onClose: () => void; deals: Deal[]; initialDealId?: string }) {
  const startDeal = deals.find(d => d.id === initialDealId) ?? deals[0];
  const [dealId, setDealId] = useState<string | undefined>(startDeal?.id);
  const [tab, setTab] = useState<Tab>("generate");
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(() => prefillFromDeal(startDeal));
  const chooseDeal = (id: string) => { setDealId(id); setForm(prefillFromDeal(deals.find(d => d.id === id))); setStep(1); };
  const [loading, setLoading] = useState(false);
  const [agreement, setAgreement] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [reviewResult, setReviewResult] = useState<any>(null);

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function generateAgreement() {
    setLoading(true);
    setAgreement("");
    const prompt = `You are an expert in Karnataka tenancy law. Draft a complete, legally sound rental agreement for the following details. Use formal legal language with numbered sections covering: parties, property description, term, rent, deposit, maintenance, termination, notice period, and dispute resolution (Bangalore jurisdiction).

Property: ${form.address} (${form.propType}, ${form.furnishing})
Landlord: ${form.llName}, ID ending ${form.llId}, address: ${form.llAddress}
Tenant: ${form.tnName}, ID ending ${form.tnId}, address: ${form.tnAddress}, profession: ${form.tnJob}
Monthly Rent: Rs.${form.rent}, due on ${form.dueDate}
Security Deposit: Rs.${form.deposit}
Start: ${form.start}, Duration: ${form.duration}, Lock-in: ${form.lockin}
Maintenance: ${form.maint}, Parking: ${form.parking}, Pets: ${form.pets}
Annual increment: ${form.increment}
Special clauses: ${form.special || "None"}

Begin with RENTAL AGREEMENT as the title. Draft the complete agreement now.`;

    try {
      const raw = await callGemini(prompt);
      const text = raw
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/^##\s*/gm, "")
        .replace(/^#\s*/gm, "");
      setAgreement(text);
    } catch (e) {
      setAgreement("Error generating agreement. Please try again.");
    }
    setLoading(false);
  }

  async function reviewAgreement() {
    if (!reviewText.trim()) return;
    setLoading(true);
    setReviewResult(null);
    const prompt = `You are a tenant rights expert in Karnataka and Indian tenancy law. Review this rental agreement and identify problematic, illegal, or unfair clauses.

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "summary": "2-3 sentence overall assessment",
  "risk_level": "LOW" or "MEDIUM" or "HIGH",
  "clauses": [
    { "title": "clause name", "risk": "RED" or "AMBER" or "GREEN", "text": "brief explanation max 2 sentences" }
  ]
}

Agreement: ${reviewText}`;

    try {
      const raw = (await callGemini(prompt)).replace(/```json|```/g, "").trim();
      setReviewResult(JSON.parse(raw));
    } catch (e) {
      setReviewResult({ summary: "Could not parse results. Please try again.", risk_level: "MEDIUM", clauses: [] });
    }
    setLoading(false);
  }

  function downloadPDF() {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(agreement, 180);
    let y = 15;
    lines.forEach((line: string) => {
      if (y > 280) { doc.addPage(); y = 15; }
      doc.text(line, 15, y); y += 6;
    });
    doc.save("RentRight_Agreement.pdf");
  }

  const riskBg: Record<string, string> = { RED: "#fee2e2", AMBER: "#fef3c7", GREEN: "#dcfce7" };
  const riskText: Record<string, string> = { RED: "#991b1b", AMBER: "#92400e", GREEN: "#166534" };
  const riskBorder: Record<string, string> = { RED: "#f87171", AMBER: "#fbbf24", GREEN: "#4ade80" };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-900 flex items-center justify-center text-green-400 text-base">⚖</div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">RentRight</h2>
              <p className="text-xs text-gray-400">Karnataka rent agreements, done right</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
        </div>

        {deals.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-3xl">🔒</p>
            <p className="font-semibold text-gray-900">RentRight unlocks once a deal is agreed</p>
            <p className="text-sm text-gray-500">
              Chat with the owner or tenant, then both of you tap <b>🤝 Mark deal agreed</b> in the conversation.
              RentRight will then draft the rental agreement with the property details filled in.
            </p>
            <button onClick={onClose} className="mt-2 px-5 py-2 rounded-lg bg-gray-900 text-white text-sm">Got it</button>
          </div>
        ) : (
        <div className="p-5">
          {deals.length > 1 && (
            <div className="mb-4">
              <label className="text-xs text-gray-500">Agreement for</label>
              <select value={dealId} onChange={e => chooseDeal(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900">
                {deals.map(d => (
                  <option key={d.id} value={d.id}>{d.properties?.title || d.properties?.address || "Property"}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-5">
            {(["generate", "review"] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={"flex-1 py-2.5 text-sm font-medium transition-colors " + (tab === t ? "bg-green-900 text-green-400" : "bg-white text-gray-500 hover:bg-gray-50")}>
                {t === "generate" ? "📝 Generate Agreement" : "🔍 Review My Agreement"}
              </button>
            ))}
          </div>

          {tab === "generate" && (
            <div>
              <div className="flex gap-1.5 mb-3">
                {[1, 2, 3].map(n => (
                  <div key={n} className={"h-1 flex-1 rounded-full transition-colors " + (n < step ? "bg-green-400" : n === step ? "bg-green-900" : "bg-gray-200")} />
                ))}
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Step {step} of 3 — <span className="font-medium text-gray-700">{["","Property details","Tenant & rent","Terms & generate"][step]}</span>
              </p>

              {step === 1 && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Property</p>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Full address</label>
                      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.address} onChange={set("address")} placeholder="Flat 4B, Prestige Lakeside, Whitefield, Bangalore 560066" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Type</label>
                        <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={form.propType} onChange={set("propType")}>
                          {["1 BHK Apartment","2 BHK Apartment","3 BHK Apartment","Independent House","PG / Room","Studio Apartment"].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Furnishing</label>
                        <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={form.furnishing} onChange={set("furnishing")}>
                          {["Fully Furnished","Semi Furnished","Unfurnished"].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Landlord</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Full name</label>
                        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.llName} onChange={set("llName")} placeholder="Rajesh Kumar" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Aadhaar/PAN (last 4)</label>
                        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.llId} onChange={set("llId")} placeholder="XXXX1234" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Permanent address</label>
                      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.llAddress} onChange={set("llAddress")} placeholder="Permanent address" />
                    </div>
                  </div>
                  <button onClick={() => setStep(2)} className="w-full bg-green-900 text-green-400 py-2.5 rounded-lg text-sm font-medium">Next — Tenant & Rent →</button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Tenant</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Full name", key: "tnName", placeholder: "Priya Sharma" },
                        { label: "Aadhaar/PAN (last 4)", key: "tnId", placeholder: "XXXX5678" },
                        { label: "Permanent address", key: "tnAddress", placeholder: "Home state address" },
                        { label: "Profession", key: "tnJob", placeholder: "Software Engineer" },
                      ].map(({ label, key, placeholder }) => (
                        <div key={key}>
                          <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={(form as any)[key]} onChange={set(key as keyof FormData)} placeholder={placeholder} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Rent & deposit</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Monthly rent (Rs.)</label>
                        <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.rent} onChange={set("rent")} placeholder="25000" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Deposit (Rs.)</label>
                        <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.deposit} onChange={set("deposit")} placeholder="75000" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Due date</label>
                        <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={form.dueDate} onChange={set("dueDate")}>
                          {["1st of month","5th of month","10th of month"].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Start date</label>
                        <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.start} onChange={set("start")} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Duration</label>
                        <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={form.duration} onChange={set("duration")}>
                          {["11 months","12 months","24 months"].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Lock-in</label>
                        <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={form.lockin} onChange={set("lockin")}>
                          {["None","3 months","6 months","11 months"].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setStep(1)} className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm font-medium text-gray-700">← Back</button>
                    <button onClick={() => setStep(3)} className="flex-1 bg-green-900 text-green-400 py-2.5 rounded-lg text-sm font-medium">Next — Terms →</button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Additional terms</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Maintenance", key: "maint", opts: ["Paid by tenant","Paid by landlord","Shared equally"] },
                        { label: "Parking", key: "parking", opts: ["1 parking included","2 parkings included","No parking"] },
                        { label: "Pets", key: "pets", opts: ["Not allowed","Allowed","With prior permission"] },
                        { label: "Annual increment", key: "increment", opts: ["5%","8%","10%","None"] },
                      ].map(({ label, key, opts }) => (
                        <div key={key}>
                          <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={(form as any)[key]} onChange={set(key as keyof FormData)}>
                            {opts.map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                      ))}
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 mb-1 block">Special clauses (optional)</label>
                        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.special} onChange={set("special")} placeholder="e.g. No subletting, 60 days notice period..." />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setStep(2)} className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm font-medium text-gray-700">← Back</button>
                    <button onClick={generateAgreement} disabled={loading} className="flex-1 bg-green-900 text-green-400 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40">
                      {loading ? "Drafting..." : "✦ Generate Agreement"}
                    </button>
                  </div>
                  {agreement && (
                    <div className="mt-2">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700">✓ Agreement ready</span>
                        <div className="flex gap-2">
                          <button onClick={() => navigator.clipboard.writeText(agreement)} className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50">Copy</button>
                          <button onClick={downloadPDF} className="text-xs bg-green-900 text-green-400 px-3 py-1.5 rounded-lg">Download PDF</button>
                        </div>
                      </div>
                      <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs leading-relaxed whitespace-pre-wrap text-gray-800 max-h-80 overflow-y-auto">{agreement}</pre>
                      <p className="text-xs text-gray-400 mt-2">AI-generated for reference only. Execute on stamp paper at Sub-Registrar office for legal validity.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "review" && (
            <div className="space-y-4">
              {!reviewResult ? (
                <>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-3">Paste your agreement</p>
                    <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none bg-white" rows={10} value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="Paste your rent agreement text here..." />
                  </div>
                  <button onClick={reviewAgreement} disabled={loading || !reviewText.trim()} className="w-full bg-green-900 text-green-400 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40">
                    {loading ? "Reviewing clauses..." : "🔍 Review Agreement"}
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-800">Overall risk</span>
                      <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: riskBg[reviewResult.risk_level], color: riskText[reviewResult.risk_level] }}>{reviewResult.risk_level}</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{reviewResult.summary}</p>
                  </div>
                  {reviewResult.clauses?.map((c: any, i: number) => (
                    <div key={i} className="rounded-xl p-4 border-l-2" style={{ background: riskBg[c.risk], borderColor: riskBorder[c.risk] }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: riskBorder[c.risk], color: riskText[c.risk] }}>{c.risk}</span>
                        <span className="text-sm font-medium" style={{ color: riskText[c.risk] }}>{c.title}</span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: riskText[c.risk] }}>{c.text}</p>
                    </div>
                  ))}
                  <button onClick={() => { setReviewResult(null); setReviewText(""); }} className="w-full border border-gray-200 py-2.5 rounded-lg text-sm font-medium text-gray-700">↺ New review</button>
                  <p className="text-xs text-gray-400 text-center">AI-generated guidance, not legal advice.</p>
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
