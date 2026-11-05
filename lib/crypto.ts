import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM. GOOGLE_TOKEN_KEY is 32 random bytes, base64 encoded.
const key = () => {
  const k = Buffer.from(process.env.GOOGLE_TOKEN_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("GOOGLE_TOKEN_KEY must be 32 bytes, base64");
  return k;
};

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(token: string): string {
  const [iv, tag, enc] = token.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
