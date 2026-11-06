import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseListings, TEMPLATE, type ParsedRow } from "@/lib/bulkImport";

/** Admin: import many listings from a CSV, with a validated preview before anything is saved. */
export default function BulkImport({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const valid = rows?.filter((r) => r.data) ?? [];
  const bad = rows?.filter((r) => !r.data) ?? [];

  const onFile = async (f: File | undefined) => {
    if (!f || !user) return;
    if (f.size > 2_000_000) { toast.error("File too large (max 2 MB / 500 rows)."); return; }
    const { rows, headerError } = parseListings(await f.text(), user.id);
    if (headerError) { toast.error(headerError); return; }
    setFileName(f.name); setRows(rows);
  };

  const run = async () => {
    setBusy(true); setProgress(0);
    let ok = 0; const failed: string[] = [];
    for (const r of valid) {
      const { data, error } = await (supabase as any).from("properties").insert(r.data).select("id").single();
      if (error) failed.push(`Row ${r.line}: ${error.message}`);
      else {
        ok++;
        if (r.owner) await (supabase as any).from("listing_owner_contacts").insert({ property_id: data.id, owner_name: r.owner.name, owner_phone: r.owner.phone });
      }
      setProgress((p) => p + 1);
    }
    setBusy(false);
    if (failed.length) toast.error(`${failed.length} row(s) failed`, { description: failed.slice(0, 3).join("\n"), duration: 10000 });
    if (ok) { toast.success(`Imported ${ok} listing${ok > 1 ? "s" : ""}`); setRows(null); onDone(); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gray-900 p-4 text-sm text-gray-300">
        <p className="font-semibold text-white">Import listings from a spreadsheet</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-gray-400">
          <li>Download the template and fill one row per listing (Excel or Google Sheets → save as CSV).</li>
          <li>Coordinates are optional: if blank, the pin goes to the centre of the area named in the address.</li>
          <li>Separate multiple amenities or photo URLs with <b>;</b>. Owner phone is stored privately, as with "list on behalf".</li>
          <li><b>status</b> = approved publishes immediately; anything else goes to Pending for review.</li>
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="easyhousehunt-listings-template.csv"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-600">
            <Download className="h-4 w-4" /> Download template
          </a>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600">
            <Upload className="h-4 w-4" /> Choose CSV file
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
      </div>

      {rows && (
        <div className="space-y-3">
          <p className="text-sm text-gray-300">
            <b>{fileName}</b>: <span className="text-green-400">{valid.length} ready</span>
            {bad.length > 0 && <>, <span className="text-red-400">{bad.length} with errors (will be skipped)</span></>}
          </p>
          <div className="max-h-96 space-y-1.5 overflow-y-auto rounded-xl border border-gray-800 p-2">
            {rows.map((r) => (
              <div key={r.line} className={`rounded-lg p-2 text-xs ${r.data ? "bg-gray-900" : "bg-red-950/40"}`}>
                <p className={r.data ? "text-gray-200" : "text-red-200"}><span className="text-gray-500">Row {r.line}</span> · {r.preview}
                  {r.data && <span className={`ml-2 rounded px-1.5 py-0.5 ${(r.data as any).status === "approved" ? "bg-green-900 text-green-300" : "bg-yellow-900 text-yellow-300"}`}>{(r.data as any).status}</span>}
                </p>
                {r.errors.map((e) => <p key={e} className="text-red-300">✕ {e}</p>)}
                {r.warnings.map((w) => <p key={w} className="text-yellow-300/80">! {w}</p>)}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={run} disabled={!valid.length || busy}
              className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40">
              {busy ? `Importing ${progress}/${valid.length}…` : `Import ${valid.length} listing${valid.length === 1 ? "" : "s"}`}
            </button>
            <button onClick={() => setRows(null)} disabled={busy} className="rounded-xl bg-gray-800 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
