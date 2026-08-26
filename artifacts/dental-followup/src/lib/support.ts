import { buildWhatsappLink, normalizeMobile } from "@workspace/shared";

export function normalizeSupportWhatsapp(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const result = normalizeMobile(value);
  return result.ok ? result.normalized : null;
}

export function buildSupportWhatsappLink(
  value: string | null | undefined,
  message: string,
): string | null {
  const normalized = normalizeSupportWhatsapp(value);
  if (!normalized || !message.trim()) return null;
  return buildWhatsappLink(normalized, message.trim());
}