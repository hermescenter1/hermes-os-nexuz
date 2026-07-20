export interface BaseTemplateOptions {
  /** BCP-47-ish document language; defaults to English (89B-FINAL). */
  lang?: string;
  /** Document direction; Persian emails render rtl. */
  dir?: "ltr" | "rtl";
  /** Localized footer lines; defaults preserve the original English footer. */
  footerTagline?: string;
  footerNote?: string;
}

export function baseTemplate(content: string, previewText = "", options: BaseTemplateOptions = {}): string {
  const lang = options.lang ?? "en";
  const dir = options.dir ?? "ltr";
  const footerTagline = options.footerTagline ?? "Hermes OS &mdash; AI-Powered Industrial Intelligence";
  const footerNote =
    options.footerNote ?? "If you did not request this email, no action is required — you can safely ignore it.";
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width:600px) {
      .card  { padding: 28px 24px !important; }
      .btn   { padding: 13px 28px !important; font-size: 15px !important; }
      .title { font-size: 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#07070f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${previewText ? `  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ""}
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#07070f;">
    <tr>
      <td align="center" style="padding:48px 20px 40px;">

        <!-- Wrapper -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;width:100%;">

          <!-- Logo / Brand -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#6d28d9 0%,#1d4ed8 100%);border-radius:14px;padding:11px 22px;">
                    <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">HERMES OS</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td class="card" style="background-color:#10101c;border:1px solid #1c1c2e;border-radius:18px;padding:44px 48px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:28px;text-align:center;">
              <p style="color:#3a3a5c;font-size:12px;line-height:1.6;margin:0 0 6px;">
                ${footerTagline}
              </p>
              <p style="color:#2e2e48;font-size:11px;margin:0;">
                ${footerNote}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
