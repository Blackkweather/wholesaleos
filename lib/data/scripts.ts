import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "./db";
import type { ScriptType } from "@prisma/client";

/** Persist a generated script/letter for a deal so it's ready without re-generating. */
export async function saveScript(
  dealId: string,
  type: ScriptType,
  content: string,
): Promise<boolean> {
  if (!(await isDbReady())) return false;
  try {
    await prisma.script.create({ data: { dealId, type, content } });
    return true;
  } catch {
    return false;
  }
}

/** Get the most recent saved script of a type for a deal. */
export async function getLatestScript(
  dealId: string,
  type: ScriptType,
): Promise<{ content: string; createdAt: string } | null> {
  if (!(await isDbReady())) return null;
  const s = await prisma.script.findFirst({
    where: { dealId, type },
    orderBy: { createdAt: "desc" },
    select: { content: true, createdAt: true },
  });
  return s ? { content: s.content, createdAt: s.createdAt.toISOString() } : null;
}

/** Has this deal already got a saved script of this type? (avoid duplicate AI calls) */
export async function hasScript(dealId: string, type: ScriptType): Promise<boolean> {
  if (!(await isDbReady())) return false;
  const c = await prisma.script.count({ where: { dealId, type } });
  return c > 0;
}
