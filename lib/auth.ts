// Edge-safe session tokens: Web Crypto only (this module runs in middleware).

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  const exp = now + YEAR_MS;
  return `${exp}.${await hmacHex(secret, String(exp))}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!sig || !/^\d+$/.test(expStr)) return false;
  const expected = await hmacHex(secret, expStr);
  if (!safeEqual(sig, expected)) return false;
  return Number(expStr) > now;
}
