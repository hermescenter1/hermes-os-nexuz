import { baseTemplate } from "./base";

export interface WelcomeEmailData {
  name: string;
}

export function welcomeEmailHtml(data: WelcomeEmailData): string {
  const content = `
    <h1 class="title" style="color:#e4e4f0;font-size:22px;font-weight:700;margin:0 0 8px;line-height:1.3;">
      Welcome to Hermes OS
    </h1>
    <p style="color:#7878a0;font-size:14px;margin:0 0 28px;">Hi ${escapeHtml(data.name)}, your account is now active.</p>

    <p style="color:#c0c0dc;font-size:15px;line-height:1.65;margin:0 0 24px;">
      Your email address has been verified and your Hermes OS account is fully activated.
      You can now sign in and start using the platform.
    </p>

    <!-- Feature highlights -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
           style="background:#0a0a14;border:1px solid #1c1c2e;border-radius:12px;padding:20px 24px;margin:0 0 32px;">
      <tr>
        <td>
          <p style="color:#8888b0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 14px;">
            What you can do with Hermes OS
          </p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding:5px 0;">
                <p style="color:#a0a0c8;font-size:14px;margin:0;">
                  <span style="color:#7c3aed;font-weight:700;margin-right:8px;">&#9670;</span>
                  AI-driven industrial root cause analysis
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:5px 0;">
                <p style="color:#a0a0c8;font-size:14px;margin:0;">
                  <span style="color:#1d4ed8;font-weight:700;margin-right:8px;">&#9670;</span>
                  Knowledge graph and engineering memory
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:5px 0;">
                <p style="color:#a0a0c8;font-size:14px;margin:0;">
                  <span style="color:#7c3aed;font-weight:700;margin-right:8px;">&#9670;</span>
                  Intelligent document search and retrieval
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- CTA -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 32px;">
      <tr>
        <td align="center">
          <a class="btn" href="${process.env.APP_URL ?? "https://hermesos.dev"}"
             style="display:inline-block;background:linear-gradient(135deg,#6d28d9 0%,#1d4ed8 100%);color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 44px;border-radius:10px;letter-spacing:0.3px;mso-padding-alt:0;">
            Sign In to Hermes OS
          </a>
        </td>
      </tr>
    </table>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
           style="border-top:1px solid #1c1c2e;padding-top:22px;">
      <tr>
        <td>
          <p style="color:#5a5a80;font-size:13px;margin:0;line-height:1.6;">
            If you have any questions, reach out to our support team. We&rsquo;re here to help.
          </p>
        </td>
      </tr>
    </table>`;

  return baseTemplate(content, `Your Hermes OS account is ready — welcome aboard`);
}

export function welcomeEmailText(data: WelcomeEmailData): string {
  return `Hi ${data.name},

Your email address has been verified and your Hermes OS account is fully activated.

You can now sign in and start using the platform:
${process.env.APP_URL ?? "https://hermesos.dev"}

What you can do with Hermes OS:
- AI-driven industrial root cause analysis
- Knowledge graph and engineering memory
- Intelligent document search and retrieval

Welcome aboard!

— Hermes OS`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
