import { baseTemplate } from "./base";

export interface VerificationEmailData {
  name:             string;
  verificationLink: string;
  expiresInHours:   number;
}

export function verificationEmailHtml(data: VerificationEmailData): string {
  const content = `
    <h1 class="title" style="color:#e4e4f0;font-size:22px;font-weight:700;margin:0 0 8px;line-height:1.3;">
      Verify your email address
    </h1>
    <p style="color:#7878a0;font-size:14px;margin:0 0 28px;">Welcome to Hermes OS, ${escapeHtml(data.name)}</p>

    <p style="color:#c0c0dc;font-size:15px;line-height:1.65;margin:0 0 32px;">
      You're almost there. Click the button below to verify your email address and
      activate your Hermes OS account.
    </p>

    <!-- CTA Button -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 36px;">
      <tr>
        <td align="center">
          <a class="btn" href="${data.verificationLink}"
             style="display:inline-block;background:linear-gradient(135deg,#6d28d9 0%,#1d4ed8 100%);color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 44px;border-radius:10px;letter-spacing:0.3px;mso-padding-alt:0;">
            <!--[if mso]><i style="letter-spacing:44px;mso-font-width:-100%;mso-text-raise:30pt">&nbsp;</i><![endif]-->
            Verify Email Address
            <!--[if mso]><i style="letter-spacing:44px;mso-font-width:-100%">&nbsp;</i><![endif]-->
          </a>
        </td>
      </tr>
    </table>

    <!-- Fallback link -->
    <p style="color:#4a4a6a;font-size:12px;margin:0 0 10px;">Or copy and paste this link into your browser:</p>
    <p style="margin:0 0 32px;word-break:break-all;background:#0a0a14;border:1px solid #1c1c30;border-radius:8px;padding:12px 14px;">
      <a href="${data.verificationLink}"
         style="color:#8b6ee8;font-size:12px;text-decoration:none;">${data.verificationLink}</a>
    </p>

    <!-- Expiry notice -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
           style="border-top:1px solid #1c1c2e;padding-top:22px;">
      <tr>
        <td>
          <p style="color:#5a5a80;font-size:13px;margin:0;line-height:1.6;">
            This link expires in
            <strong style="color:#9d7fe8;">${data.expiresInHours}&nbsp;hours</strong>.
            If you didn&rsquo;t create a Hermes OS account, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>`;

  return baseTemplate(content, `Verify your email to activate your Hermes OS account — link expires in ${data.expiresInHours}h`);
}

export function verificationEmailText(data: VerificationEmailData): string {
  return `Hi ${data.name},

Welcome to Hermes OS! Please verify your email address to activate your account.

Verify your email:
${data.verificationLink}

This link expires in ${data.expiresInHours} hours.

If you didn't create a Hermes OS account, you can safely ignore this email.

— Hermes OS`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
