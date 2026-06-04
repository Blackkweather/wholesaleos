import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

/**
 * AES-256-GCM encryption for per-user secrets (e.g. Twilio token) stored at
 * rest. The configured ENCRYPTION_KEY is hashed to a fixed 32-byte key so any
 * passphrase length works. Ciphertext format: ivB64:tagB64:dataB64
 */
const ALGORITHM = "aes-256-gcm";

function key(): Buffer {
  const secret = env.ENCRYPTION_KEY ?? "insecure-development-key";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed ciphertext");
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Decrypt without throwing — returns null on any failure. */
export function safeDecrypt(payload?: string | null): string | null {
  if (!payload) return null;
  try {
    return decrypt(payload);
  } catch {
    return null;
  }
}
