import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 15 * 60 * 1000;
type Claims = { tenantId: string; patientId: string; userId: string; objectPath: string; name: string; size: number; contentType: string; exp: number };
function secret(): string { const value = process.env.SESSION_SECRET; if (!value) throw new Error("SESSION_SECRET is required."); return value; }
export function createPatientAttachmentToken(claims: Omit<Claims, "exp">): string {
  const payload = Buffer.from(JSON.stringify({ ...claims, exp: Date.now() + TTL_MS })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
export function verifyPatientAttachmentToken(token: unknown, expected: Omit<Claims, "exp">): boolean {
  if (typeof token !== "string") return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const actual = createHmac("sha256", secret()).update(payload).digest();
  let provided: Buffer; try { provided = Buffer.from(signature, "base64url"); } catch { return false; }
  if (actual.length !== provided.length || !timingSafeEqual(actual, provided)) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Claims;
    return claims.exp > Date.now() && JSON.stringify({ tenantId: claims.tenantId, patientId: claims.patientId, userId: claims.userId, objectPath: claims.objectPath, name: claims.name, size: claims.size, contentType: claims.contentType }) === JSON.stringify(expected);
  } catch { return false; }
}
export function verifyPatientAttachmentCancelToken(token: unknown, expected: Pick<Claims, "tenantId" | "patientId" | "userId" | "objectPath">): boolean {
  if (typeof token !== "string") return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const actual = createHmac("sha256", secret()).update(payload).digest();
  let provided: Buffer; try { provided = Buffer.from(signature, "base64url"); } catch { return false; }
  if (actual.length !== provided.length || !timingSafeEqual(actual, provided)) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Claims;
    return claims.exp > Date.now() && claims.tenantId === expected.tenantId && claims.patientId === expected.patientId && claims.userId === expected.userId && claims.objectPath === expected.objectPath;
  } catch { return false; }
}