import { baseTemplate } from "./base";

export interface PasswordResetEmailData {
  name:           string;
  resetLink:      string;
  expiresInHours: number;
}

export function passwordResetEmailHtml(data: PasswordResetEmailData): string {
  const content = `
    <h1 class="title" style="color:#e4e4f0;font-size:22px;font-weight:700;margin:0 0 8px;line-height:1.3;">
      Reset your password
    </h1>
    <p style="color:#7878a0;font-size:14px;margin:0 0 28px;">Hi, ${escapeHtml(data.name)}</p>

    <p style="color:#c0c0dc;font-size:15px;line-height:1.65;margin:0 0 16px;">
      We received a request to reset the password for your Hermes OS account.
      Click the button below to choose a new password.
    </p>

    <p style="color:#7878a0;font-size:14px;line-height:1.6;margin:0 0 32px;">
      If you did not request this, you can safely ignore this email. Your password will not change.
    </p>

    <!-- CTA Button -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 36px;">
      <tr>
        <td align="center">
          <a class="btn" href="${data.resetLink}"
             style="display:inline-block;background:linear-gradient(135deg,#6d28d9 0%,#1d4ed8 100%);color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 44px;border-radius:10px;letter-spacing:0.3px;mso-padding-alt:0;">
            <!--[if mso]><i style="letter-spacing:44px;mso-font-width:-100%;mso-text-raise:30pt">&nbsp;</i><![endif]-->
            Reset My Password
            <!--[if mso]><i style="letter-spacing:44px;mso-font-width:-100%">&nbsp;</i><![endif]-->
          </a>
        </td>
      </tr>
    </table>

    <!-- Fallback link -->
    <p style="color:#4a4a6a;font-size:12px;margin:0 0 10px;">Or copy and paste this link into your browser:</p>
    <p style="margin:0 0 32px;word-break:break-all;background:#0a0a14;border:1px solid #1c1c30;border-radius:8px;padding:12px 14px;">
      <a href="${data.resetLink}"
         style="color:#8b6ee8;font-size:12px;text-decoration:none;">${data.resetLink}</a>
    </p>

    <!-- Security notice -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
           style="border-top:1px solid #1c1c2e;padding-top:22px;">
      <tr>
        <td>
          <p style="color:#5a5a80;font-size:13px;margin:0 0 8px;line-height:1.6;">
            <strong style="color:#9d7fe8;">Security notice:</strong>
            This link expires in <strong style="color:#9d7fe8;">${data.expiresInHours}&nbsp;hour${data.expiresInHours !== 1 ? "s" : ""}</strong>
            and can only be used once.
          </p>
          <p style="color:#4a4a6a;font-size:12px;margin:0;line-height:1.6;">
            If you didn&rsquo;t request a password reset, your account is safe &mdash;
            someone may have entered your email by mistake.
          </p>
        </td>
      </tr>
    </table>`;

  return baseTemplate(content, `Password reset link for your Hermes OS account — expires in ${data.expiresInHours}h`);
}

export function passwordResetEmailText(data: PasswordResetEmailData): string {
  return `Hi ${data.name},

We received a request to reset the password for your Hermes OS account.

Reset your password:
${data.resetLink}

This link expires in ${data.expiresInHours} hour${data.expiresInHours !== 1 ? "s" : ""} and can only be used once.

If you did not request this, you can safely ignore this email — your password will not change.

— Hermes OS`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
