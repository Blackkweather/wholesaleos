import "server-only";
import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), ".data", "briefing.json");

export interface StoredBriefing {
  text: string;
  dealsScanned: number;
  buyersScanned: number;
  generatedAt: string; // ISO
}

function ensureDir() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readBriefing(): StoredBriefing | null {
  try {
    if (!fs.existsSync(FILE)) return null;
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as StoredBriefing;
  } catch {
    return null;
  }
}

export function writeBriefing(b: StoredBriefing): void {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(b, null, 2), "utf8");
}
