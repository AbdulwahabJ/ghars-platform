import type { Locale } from "@workspace/shared";

export interface VerificationEmailInput {
  to: string;
  fullName: string;
  locale: Locale;
  token: string;
}

interface Config { apiKey: string; from: string; baseUrl: URL }

function config(): Config | null {
  const { RESEND_API_KEY: apiKey, RESEND_FROM: from, APP_BASE_URL: raw } = process.env;
  if (!apiKey || !from || !raw) return null;
  try {
    const baseUrl = new URL(raw);
    if (!["http:", "https:"].includes(baseUrl.protocol)) return null;
    if (process.env.NODE_ENV === "production" && baseUrl.protocol !== "https:") return null;
    return { apiKey, from, baseUrl };
  } catch { return null; }
}

export function isVerificationEmailConfigured(): boolean { return config() !== null; }

/** Raw tokens are used only in the URL and must never be logged. */
export async function sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
  const settings = config();
  if (!settings) throw new Error("Verification email is not configured.");
  const url = new URL("verify-email", settings.baseUrl.href.endsWith("/") ? settings.baseUrl.href : `${settings.baseUrl.href}/`);
  url.searchParams.set("token", input.token);
  const en = input.locale === "en";
  const subject = en ? "Verify your Ghars account" : "تأكيد حسابك في غرس";
  const text = en
    ? `Hello ${input.fullName},\n\nVerify your email to start your 72-hour Ghars trial:\n${url}\n\nThis link can be used once.`
    : `مرحبًا ${input.fullName}،\n\nأكد بريدك الإلكتروني لبدء الفترة التجريبية لمدة 72 ساعة في غرس:\n${url}\n\nهذا الرابط صالح للاستخدام مرة واحدة.`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: settings.from, to: [input.to], subject, text }),
  });
  if (!response.ok) throw new Error(`Verification email delivery failed (${response.status}).`);
}