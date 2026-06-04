import "server-only";
import { env, features } from "./env";

const LOB_BASE = "https://api.lob.com/v1";

export function isLobConfigured(): boolean {
  return features.lob;
}

export interface MailAddress {
  name: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
}

/** Parse an HCAD "mail: line1, city, ST, zip" string into a structured address. */
export function parseMailAddress(name: string, mailing: string): MailAddress | null {
  const parts = mailing.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const zip = (parts.find((p) => /\d{5}/.test(p)) ?? "").match(/\d{5}/)?.[0] ?? "";
  const state = parts.find((p) => /^[A-Z]{2}$/.test(p)) ?? "TX";
  return { name, line1: parts[0], city: parts[1], state, zip };
}

export interface LobResult {
  id: string;
  expectedDelivery?: string;
  status: string;
}

/** Send a physical letter via Lob (printed + mailed from the US). */
export async function sendLetterViaLob(to: MailAddress, html: string, description: string): Promise<LobResult> {
  if (!isLobConfigured()) throw new Error("LOB_NOT_CONFIGURED");

  const from: MailAddress = {
    name: env.LOB_FROM_NAME ?? "Acquisitions",
    line1: env.LOB_FROM_LINE1!,
    city: env.LOB_FROM_CITY ?? "Houston",
    state: env.LOB_FROM_STATE ?? "TX",
    zip: env.LOB_FROM_ZIP ?? "77002",
  };

  const body = new URLSearchParams();
  body.set("description", description);
  body.set("to[name]", to.name);
  body.set("to[address_line1]", to.line1);
  body.set("to[address_city]", to.city);
  body.set("to[address_state]", to.state);
  body.set("to[address_zip]", to.zip);
  body.set("from[name]", from.name);
  body.set("from[address_line1]", from.line1);
  body.set("from[address_city]", from.city);
  body.set("from[address_state]", from.state);
  body.set("from[address_zip]", from.zip);
  body.set("file", `<html><body style="font-family:Arial,sans-serif;padding:1in;font-size:12pt;line-height:1.5">${html}</body></html>`);
  body.set("color", "false");
  body.set("address_placement", "top_first_page");

  const auth = Buffer.from(`${env.LOB_API_KEY}:`).toString("base64");
  const res = await fetch(`${LOB_BASE}/letters`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Lob ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id?: string; expected_delivery_date?: string };
  return { id: data.id ?? "", expectedDelivery: data.expected_delivery_date, status: "mailed" };
}
