interface PasswordResetEmailInput {
  to: string;
  fullName: string;
  token: string;
}

interface PasswordResetEmailConfig {
  apiKey: string;
  from: string;
  appBaseUrl: URL;
}

function getConfig(): PasswordResetEmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  const rawBaseUrl = process.env.APP_BASE_URL;
  if (!apiKey || !from || !rawBaseUrl) return null;

  try {
    const appBaseUrl = new URL(rawBaseUrl);
    if (!["https:", "http:"].includes(appBaseUrl.protocol)) return null;
    if (process.env.NODE_ENV === "production" && appBaseUrl.protocol !== "https:") {
      return null;
    }
    return { apiKey, from, appBaseUrl };
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

export function isPasswordResetEmailConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Sends the raw one-time token only in the reset URL. Never log the token,
 * recipient address, or API response body around this call.
 */
export async function sendPasswordResetEmail({
  to,
  fullName,
  token,
}: PasswordResetEmailInput): Promise<void> {
  const config = getConfig();
  if (!config) {
    throw new Error("Password reset email is not configured.");
  }

  const resetUrl = new URL(
    "reset-password",
    config.appBaseUrl.href.endsWith("/")
      ? config.appBaseUrl.href
      : `${config.appBaseUrl.href}/`,
  );
  resetUrl.searchParams.set("token", token);

  const recipientName = escapeHtml(fullName);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [to],
      subject: "إعادة تعيين كلمة المرور | غرس",
      text: [
        `مرحبًا ${fullName}،`,
        "",
        "تلقينا طلبًا لإعادة تعيين كلمة مرور حسابك في غرس.",
        "استخدم الرابط التالي لتعيين كلمة مرور جديدة خلال 30 دقيقة:",
        resetUrl.toString(),
        "",
        "إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.",
      ].join("\n"),
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;color:#0D1B3D;line-height:1.8">
          <p>مرحبًا ${recipientName}،</p>
          <p>تلقينا طلبًا لإعادة تعيين كلمة مرور حسابك في غرس.</p>
          <p>
            <a href="${resetUrl.toString()}" style="display:inline-block;background:#0D1B3D;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">
              تعيين كلمة مرور جديدة
            </a>
          </p>
          <p>ينتهي هذا الرابط خلال 30 دقيقة وهو صالح للاستخدام مرة واحدة.</p>
          <p>إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error(`Password reset email delivery failed (${response.status}).`);
  }
}