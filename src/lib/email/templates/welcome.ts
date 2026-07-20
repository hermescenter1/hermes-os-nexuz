import { baseTemplate } from "./base";
import { WELCOME_STRINGS, EMAIL_DIR, resolveEmailLocale } from "./email-locale";

export interface WelcomeEmailData {
  name: string;
  /** Initiating request locale; unknown/missing → English (89B-FINAL). */
  locale?: string | null;
}

export function welcomeEmailHtml(data: WelcomeEmailData): string {
  const loc = resolveEmailLocale(data.locale);
  const s = WELCOME_STRINGS[loc];
  const dir = EMAIL_DIR[loc];
  const align = dir === "rtl" ? "right" : "left";
  const markerMargin = dir === "rtl" ? "margin-left:8px;" : "margin-right:8px;";
  const appUrl = process.env.APP_URL ?? "https://hermesos.dev";

  const content = `
    <div dir="${dir}" style="text-align:${align};">
    <h1 class="title" style="color:#e4e4f0;font-size:22px;font-weight:700;margin:0 0 8px;line-height:1.3;">
      ${s.title}
    </h1>
    <p style="color:#7878a0;font-size:14px;margin:0 0 28px;">${s.greeting.replace("{name}", escapeHtml(data.name))}</p>

    <p style="color:#c0c0dc;font-size:15px;line-height:1.65;margin:0 0 24px;">
      ${s.body}
    </p>

    <!-- Feature highlights -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
           style="background:#0a0a14;border:1px solid #1c1c2e;border-radius:12px;padding:20px 24px;margin:0 0 32px;">
      <tr>
        <td>
          <p style="color:#8888b0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 14px;">
            ${s.featuresTitle}
          </p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding:5px 0;">
                <p style="color:#a0a0c8;font-size:14px;margin:0;">
                  <span style="color:#7c3aed;font-weight:700;${markerMargin}">&#9670;</span>
                  ${s.feature1}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:5px 0;">
                <p style="color:#a0a0c8;font-size:14px;margin:0;">
                  <span style="color:#1d4ed8;font-weight:700;${markerMargin}">&#9670;</span>
                  ${s.feature2}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:5px 0;">
                <p style="color:#a0a0c8;font-size:14px;margin:0;">
                  <span style="color:#7c3aed;font-weight:700;${markerMargin}">&#9670;</span>
                  ${s.feature3}
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
          <a class="btn" href="${appUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#6d28d9 0%,#1d4ed8 100%);color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 44px;border-radius:10px;letter-spacing:0.3px;mso-padding-alt:0;">
            ${s.cta}
          </a>
        </td>
      </tr>
    </table>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
           style="border-top:1px solid #1c1c2e;padding-top:22px;">
      <tr>
        <td>
          <p style="color:#5a5a80;font-size:13px;margin:0;line-height:1.6;">
            ${s.support}
          </p>
        </td>
      </tr>
    </table>
    </div>`;

  return baseTemplate(content, s.preview, {
    lang: loc,
    dir,
    footerTagline: s.footerTagline,
    footerNote: s.footerNote,
  });
}

export function welcomeEmailText(data: WelcomeEmailData): string {
  const s = WELCOME_STRINGS[resolveEmailLocale(data.locale)];
  return s.textBody
    .replace("{name}", data.name)
    .replace("{link}", process.env.APP_URL ?? "https://hermesos.dev");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
