import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { _dicts, setLang, translate } from "@/lib/i18n";

const files = (d: string): string[] => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !p.includes("/test/") ? [p] : [];
});

describe("translations", () => {
  it("Kannada and Hindi cover the same phrases", () => {
    expect(Object.keys(_dicts.kn).sort()).toEqual(Object.keys(_dicts.hi).sort());
  });
  it("every t(\"…\") phrase used in the app is translated", () => {
    const used = new Set<string>();
    for (const f of files("src")) {
      if (!/useT\(/.test(readFileSync(f, "utf8"))) continue;
      for (const m of readFileSync(f, "utf8").matchAll(/\bt\("((?:[^"\\]|\\.)+)"\)/g)) used.add(m[1].replace(/\\'/g, "'"));
    }
    expect(used.size).toBeGreaterThan(30);
    const missing = [...used].filter((k) => !(k in _dicts.kn));
    expect(missing).toEqual([]);
  });
  it("switches language and falls back to English", () => {
    setLang("kn"); expect(translate("Filters")).toBe("ಫಿಲ್ಟರ್‌ಗಳು");
    setLang("hi"); expect(translate("Filters")).toBe("फ़िल्टर");
    expect(translate("Not in the dictionary")).toBe("Not in the dictionary");
    setLang("en"); expect(translate("Filters")).toBe("Filters");
    expect(document.documentElement.lang).toBe("en-IN");
  });
});
