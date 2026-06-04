import "server-only";
import { tavilyMultiSearch, isTavilyConfigured } from "@/lib/tavily";
import { groqGenerate, isGroqConfigured } from "@/lib/groq";
import type { LeadSourceAdapter, RawLead } from "./types";
import type { DealType } from "@prisma/client";

/** Build a web-search adapter for a distressed category. */
function makeTavilyAdapter(cfg: {
  id: string;
  label: string;
  dealType: DealType;
  indicators: string[];
  queries: (city: string, state: string) => string[];
}): LeadSourceAdapter {
  return {
    id: cfg.id,
    label: cfg.label,
    kind: "web",
    async fetch({ city, state, limit = 6 }) {
      if (!isTavilyConfigured() || !isGroqConfigured()) return [];
      const results = await tavilyMultiSearch(cfg.queries(city, state), 5);
      if (results.length === 0) return [];

      const context = results.slice(0, 12)
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.content.slice(0, 350)}`)
        .join("\n\n");

      const prompt = `Extract up to ${limit} REAL ${cfg.label} property street addresses in ${city}, ${state} from these results. Only addresses explicitly present — never invent.\n\n${context}\n\nReturn ONLY a JSON array of strings (street addresses), e.g. ["1234 Main St"]. Empty [] if none.`;

      try {
        const raw = await groqGenerate({ prompt, maxTokens: 600, temperature: 0 });
        const m = raw.match(/\[[\s\S]*\]/);
        if (!m) return [];
        const addrs = JSON.parse(m[0]) as unknown[];
        return addrs
          .filter((a): a is string => typeof a === "string" && /\d/.test(a))
          .slice(0, limit)
          .map((address): RawLead => ({
            address: address.trim(),
            city,
            state,
            source: cfg.id,
            confidence: 50,
            motivationIndicators: cfg.indicators,
            dealType: cfg.dealType,
          }));
      } catch {
        return [];
      }
    },
  };
}

export const taxDelinquentAdapter = makeTavilyAdapter({
  id: "tax-delinquent",
  label: "tax-delinquent",
  dealType: "TAX_DELINQUENT",
  indicators: ["Behind on property taxes", "Tax lien / delinquency"],
  queries: (c, s) => [
    `${c} ${s} tax delinquent property list address`,
    `Harris County tax delinquent homes ${c} owner`,
    `${c} property tax lien sale houses address`,
  ],
});

export const probateAdapter = makeTavilyAdapter({
  id: "probate",
  label: "probate",
  dealType: "PROBATE",
  indicators: ["Probate / estate sale", "Inherited property"],
  queries: (c, s) => [
    `${c} ${s} probate property for sale estate address`,
    `${c} inherited house estate sale by owner`,
    `Harris County probate real estate ${c}`,
  ],
});

export const codeViolationAdapter = makeTavilyAdapter({
  id: "code-violation",
  label: "code-violation",
  dealType: "CODE_VIOLATION",
  indicators: ["Open code violation", "Distressed / non-compliant property"],
  queries: (c, s) => [
    `${c} ${s} code violation property list address`,
    `${c} code enforcement distressed house owner`,
    `${c} dangerous building / nuisance property address`,
  ],
});

export const vacantAdapter = makeTavilyAdapter({
  id: "vacant",
  label: "vacant",
  dealType: "VACANT",
  indicators: ["Vacant / abandoned property", "No occupant"],
  queries: (c, s) => [
    `${c} ${s} vacant abandoned house for sale address`,
    `${c} boarded up vacant property owner`,
    `${c} abandoned home address by owner`,
  ],
});
