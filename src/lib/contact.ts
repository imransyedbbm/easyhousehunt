// Phone numbers must never appear in public listing text: tenants reach owners through chat.
const PHONE = /(?:\+?91[\s-]*)?(?:\d[\s-]*){10,}/g;

export const PHONE_HIDDEN = "[number hidden - use chat]";

/** Replaces phone-number-like sequences with a placeholder. */
export function maskPhones(text: string | null | undefined): string {
  return (text ?? "").replace(PHONE, (m) =>
    m.replace(/\D/g, "").length >= 10 ? PHONE_HIDDEN + (m.match(/\s+$/)?.[0] ?? "") : m);
}

export const hasPhone = (text: string | null | undefined) => maskPhones(text) !== (text ?? "");
