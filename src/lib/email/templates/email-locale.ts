/**
 * PHASE 89B-FINAL — email locale layer.
 *
 * Outbound auth emails are rendered in background delivery (event handlers),
 * where no request-scoped next-intl provider exists — so the strings live here
 * as a small typed table, not in the message catalogs. The initiating
 * request's locale is threaded through the auth events; anything unknown or
 * missing falls back to English (NOT the platform default), so legacy callers
 * keep today's behavior byte-for-byte.
 *
 * URLs, tokens and expiry values are interpolated by the templates and are
 * never part of this table. Recipient names are escaped by the templates
 * before substitution.
 */

export type EmailLocale = "fa" | "en" | "de";

/** Unknown/missing locale → English (backward-compatible safe default). */
export function resolveEmailLocale(locale?: string | null): EmailLocale {
  return locale === "fa" || locale === "de" || locale === "en" ? locale : "en";
}

export const EMAIL_DIR: Record<EmailLocale, "rtl" | "ltr"> = {
  fa: "rtl",
  en: "ltr",
  de: "ltr",
};

interface BaseStrings {
  footerTagline: string;
  footerNote: string;
}

interface VerificationStrings extends BaseStrings {
  subject: string;
  title: string;
  greeting: string; // {name}
  body: string;
  cta: string;
  fallbackHint: string;
  expiryHtml: string; // {hours} — may contain <strong> markup only
  preview: string; // {hours}
  textBody: string; // {name} {link} {hours}
}

interface PasswordResetStrings extends BaseStrings {
  subject: string;
  title: string;
  greeting: string; // {name}
  body: string;
  noRequest: string;
  cta: string;
  fallbackHint: string;
  securityLabel: string;
  expiryHtml: string; // {hours}
  safeNote: string;
  preview: string; // {hours}
  textBody: string; // {name} {link} {hours}
}

interface WelcomeStrings extends BaseStrings {
  subject: string;
  title: string;
  greeting: string; // {name}
  body: string;
  featuresTitle: string;
  feature1: string;
  feature2: string;
  feature3: string;
  cta: string;
  support: string;
  preview: string;
  textBody: string; // {name} {link}
}

export const VERIFICATION_STRINGS: Record<EmailLocale, VerificationStrings> = {
  en: {
    subject: "Verify your Hermes OS email address",
    title: "Verify your email address",
    greeting: "Welcome to Hermes OS, {name}",
    body: "You're almost there. Click the button below to verify your email address and activate your Hermes OS account.",
    cta: "Verify Email Address",
    fallbackHint: "Or copy and paste this link into your browser:",
    expiryHtml:
      'This link expires in <strong style="color:#9d7fe8;">{hours}&nbsp;hours</strong>. If you didn&rsquo;t create a Hermes OS account, you can safely ignore this email.',
    preview: "Verify your email to activate your Hermes OS account — link expires in {hours}h",
    textBody:
      "Hi {name},\n\nWelcome to Hermes OS! Please verify your email address to activate your account.\n\nVerify your email:\n{link}\n\nThis link expires in {hours} hours.\n\nIf you didn't create a Hermes OS account, you can safely ignore this email.\n\n— Hermes OS",
    footerTagline: "Hermes OS — AI-Powered Industrial Intelligence",
    footerNote: "If you did not request this email, no action is required — you can safely ignore it.",
  },
  fa: {
    subject: "تأیید نشانی ایمیل شما در Hermes OS",
    title: "نشانی ایمیل خود را تأیید کنید",
    greeting: "به Hermes OS خوش آمدید، {name}",
    body: "تنها یک قدم مانده است. برای تأیید نشانی ایمیل و فعال‌سازی حساب Hermes OS خود روی دکمهٔ زیر بزنید.",
    cta: "تأیید نشانی ایمیل",
    fallbackHint: "یا این پیوند را در مرورگر خود باز کنید:",
    expiryHtml:
      'این پیوند تا <strong style="color:#9d7fe8;">{hours}&nbsp;ساعت</strong> دیگر معتبر است. اگر شما حسابی در Hermes OS نساخته‌اید، می‌توانید این ایمیل را نادیده بگیرید.',
    preview: "برای فعال‌سازی حساب Hermes OS ایمیل خود را تأیید کنید — اعتبار پیوند {hours} ساعت",
    textBody:
      "سلام {name}،\n\nبه Hermes OS خوش آمدید! لطفاً برای فعال‌سازی حساب، نشانی ایمیل خود را تأیید کنید.\n\nتأیید ایمیل:\n{link}\n\nاین پیوند تا {hours} ساعت دیگر معتبر است.\n\nاگر شما حسابی در Hermes OS نساخته‌اید، می‌توانید این ایمیل را نادیده بگیرید.\n\n— Hermes OS",
    footerTagline: "Hermes OS — هوش صنعتی مبتنی بر هوش مصنوعی",
    footerNote: "اگر این ایمیل را شما درخواست نکرده‌اید، نیازی به هیچ اقدامی نیست — می‌توانید آن را نادیده بگیرید.",
  },
  de: {
    subject: "Bestätigen Sie Ihre Hermes-OS-E-Mail-Adresse",
    title: "E-Mail-Adresse bestätigen",
    greeting: "Willkommen bei Hermes OS, {name}",
    body: "Fast geschafft. Klicken Sie auf die Schaltfläche unten, um Ihre E-Mail-Adresse zu bestätigen und Ihr Hermes-OS-Konto zu aktivieren.",
    cta: "E-Mail-Adresse bestätigen",
    fallbackHint: "Oder kopieren Sie diesen Link in Ihren Browser:",
    expiryHtml:
      'Dieser Link läuft in <strong style="color:#9d7fe8;">{hours}&nbsp;Stunden</strong> ab. Wenn Sie kein Hermes-OS-Konto erstellt haben, können Sie diese E-Mail einfach ignorieren.',
    preview: "Bestätigen Sie Ihre E-Mail, um Ihr Hermes-OS-Konto zu aktivieren — Link läuft in {hours} h ab",
    textBody:
      "Hallo {name},\n\nwillkommen bei Hermes OS! Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr Konto zu aktivieren.\n\nE-Mail bestätigen:\n{link}\n\nDieser Link läuft in {hours} Stunden ab.\n\nWenn Sie kein Hermes-OS-Konto erstellt haben, können Sie diese E-Mail einfach ignorieren.\n\n— Hermes OS",
    footerTagline: "Hermes OS — KI-gestützte industrielle Intelligenz",
    footerNote: "Wenn Sie diese E-Mail nicht angefordert haben, ist keine Aktion erforderlich — Sie können sie einfach ignorieren.",
  },
};

export const PASSWORD_RESET_STRINGS: Record<EmailLocale, PasswordResetStrings> = {
  en: {
    subject: "Reset your Hermes OS password",
    title: "Reset your password",
    greeting: "Hi, {name}",
    body: "We received a request to reset the password for your Hermes OS account. Click the button below to choose a new password.",
    noRequest: "If you did not request this, you can safely ignore this email. Your password will not change.",
    cta: "Reset My Password",
    fallbackHint: "Or copy and paste this link into your browser:",
    securityLabel: "Security notice:",
    expiryHtml:
      'This link expires in <strong style="color:#9d7fe8;">{hours}&nbsp;hours</strong> and can only be used once.',
    safeNote:
      "If you didn&rsquo;t request a password reset, your account is safe &mdash; someone may have entered your email by mistake.",
    preview: "Password reset link for your Hermes OS account — expires in {hours}h",
    textBody:
      "Hi {name},\n\nWe received a request to reset the password for your Hermes OS account.\n\nReset your password:\n{link}\n\nThis link expires in {hours} hours and can only be used once.\n\nIf you did not request this, you can safely ignore this email — your password will not change.\n\n— Hermes OS",
    footerTagline: "Hermes OS — AI-Powered Industrial Intelligence",
    footerNote: "If you did not request this email, no action is required — you can safely ignore it.",
  },
  fa: {
    subject: "بازنشانی گذرواژهٔ Hermes OS شما",
    title: "بازنشانی گذرواژه",
    greeting: "سلام، {name}",
    body: "درخواستی برای بازنشانی گذرواژهٔ حساب Hermes OS شما دریافت کردیم. برای انتخاب گذرواژهٔ جدید روی دکمهٔ زیر بزنید.",
    noRequest: "اگر شما این درخواست را نداده‌اید، می‌توانید این ایمیل را نادیده بگیرید. گذرواژهٔ شما تغییر نخواهد کرد.",
    cta: "بازنشانی گذرواژه",
    fallbackHint: "یا این پیوند را در مرورگر خود باز کنید:",
    securityLabel: "نکتهٔ امنیتی:",
    expiryHtml:
      'این پیوند تا <strong style="color:#9d7fe8;">{hours}&nbsp;ساعت</strong> دیگر معتبر است و تنها یک بار قابل استفاده است.',
    safeNote: "اگر شما درخواست بازنشانی گذرواژه نداده‌اید، حساب شما امن است — شاید کسی ایمیل شما را به‌اشتباه وارد کرده باشد.",
    preview: "پیوند بازنشانی گذرواژهٔ حساب Hermes OS شما — اعتبار {hours} ساعت",
    textBody:
      "سلام {name}،\n\nدرخواستی برای بازنشانی گذرواژهٔ حساب Hermes OS شما دریافت کردیم.\n\nبازنشانی گذرواژه:\n{link}\n\nاین پیوند تا {hours} ساعت دیگر معتبر است و تنها یک بار قابل استفاده است.\n\nاگر شما این درخواست را نداده‌اید، می‌توانید این ایمیل را نادیده بگیرید — گذرواژهٔ شما تغییر نخواهد کرد.\n\n— Hermes OS",
    footerTagline: "Hermes OS — هوش صنعتی مبتنی بر هوش مصنوعی",
    footerNote: "اگر این ایمیل را شما درخواست نکرده‌اید، نیازی به هیچ اقدامی نیست — می‌توانید آن را نادیده بگیرید.",
  },
  de: {
    subject: "Setzen Sie Ihr Hermes-OS-Passwort zurück",
    title: "Passwort zurücksetzen",
    greeting: "Hallo, {name}",
    body: "Wir haben eine Anfrage zum Zurücksetzen des Passworts für Ihr Hermes-OS-Konto erhalten. Klicken Sie auf die Schaltfläche unten, um ein neues Passwort zu wählen.",
    noRequest: "Wenn Sie dies nicht angefordert haben, können Sie diese E-Mail einfach ignorieren. Ihr Passwort wird nicht geändert.",
    cta: "Passwort zurücksetzen",
    fallbackHint: "Oder kopieren Sie diesen Link in Ihren Browser:",
    securityLabel: "Sicherheitshinweis:",
    expiryHtml:
      'Dieser Link läuft in <strong style="color:#9d7fe8;">{hours}&nbsp;Stunden</strong> ab und kann nur einmal verwendet werden.',
    safeNote:
      "Wenn Sie kein Zurücksetzen des Passworts angefordert haben, ist Ihr Konto sicher &mdash; möglicherweise hat jemand Ihre E-Mail-Adresse versehentlich eingegeben.",
    preview: "Link zum Zurücksetzen des Passworts für Ihr Hermes-OS-Konto — läuft in {hours} h ab",
    textBody:
      "Hallo {name},\n\nwir haben eine Anfrage zum Zurücksetzen des Passworts für Ihr Hermes-OS-Konto erhalten.\n\nPasswort zurücksetzen:\n{link}\n\nDieser Link läuft in {hours} Stunden ab und kann nur einmal verwendet werden.\n\nWenn Sie dies nicht angefordert haben, können Sie diese E-Mail einfach ignorieren — Ihr Passwort wird nicht geändert.\n\n— Hermes OS",
    footerTagline: "Hermes OS — KI-gestützte industrielle Intelligenz",
    footerNote: "Wenn Sie diese E-Mail nicht angefordert haben, ist keine Aktion erforderlich — Sie können sie einfach ignorieren.",
  },
};

export const WELCOME_STRINGS: Record<EmailLocale, WelcomeStrings> = {
  en: {
    subject: "Welcome to Hermes OS",
    title: "Welcome to Hermes OS",
    greeting: "Hi {name}, your account is now active.",
    body: "Your email address has been verified and your Hermes OS account is fully activated. You can now sign in and start using the platform.",
    featuresTitle: "What you can do with Hermes OS",
    feature1: "AI-driven industrial root cause analysis",
    feature2: "Knowledge graph and engineering memory",
    feature3: "Intelligent document search and retrieval",
    cta: "Sign In to Hermes OS",
    support: "If you have any questions, reach out to our support team. We&rsquo;re here to help.",
    preview: "Your Hermes OS account is ready — welcome aboard",
    textBody:
      "Hi {name},\n\nYour email address has been verified and your Hermes OS account is fully activated.\n\nYou can now sign in and start using the platform:\n{link}\n\nWhat you can do with Hermes OS:\n- AI-driven industrial root cause analysis\n- Knowledge graph and engineering memory\n- Intelligent document search and retrieval\n\nWelcome aboard!\n\n— Hermes OS",
    footerTagline: "Hermes OS — AI-Powered Industrial Intelligence",
    footerNote: "If you did not request this email, no action is required — you can safely ignore it.",
  },
  fa: {
    subject: "به Hermes OS خوش آمدید",
    title: "به Hermes OS خوش آمدید",
    greeting: "سلام {name}، حساب شما اکنون فعال است.",
    body: "نشانی ایمیل شما تأیید شد و حساب Hermes OS شما به‌طور کامل فعال است. اکنون می‌توانید وارد شوید و کار با پلتفرم را آغاز کنید.",
    featuresTitle: "با Hermes OS چه می‌توانید بکنید",
    feature1: "تحلیل ریشه‌ای خرابی‌های صنعتی با هوش مصنوعی",
    feature2: "گراف دانش و حافظهٔ مهندسی",
    feature3: "جست‌وجو و بازیابی هوشمند اسناد",
    cta: "ورود به Hermes OS",
    support: "اگر پرسشی دارید، با تیم پشتیبانی ما در تماس باشید. ما اینجاییم که کمک کنیم.",
    preview: "حساب Hermes OS شما آماده است — خوش آمدید",
    textBody:
      "سلام {name}،\n\nنشانی ایمیل شما تأیید شد و حساب Hermes OS شما به‌طور کامل فعال است.\n\nاکنون می‌توانید وارد شوید و کار با پلتفرم را آغاز کنید:\n{link}\n\nبا Hermes OS چه می‌توانید بکنید:\n- تحلیل ریشه‌ای خرابی‌های صنعتی با هوش مصنوعی\n- گراف دانش و حافظهٔ مهندسی\n- جست‌وجو و بازیابی هوشمند اسناد\n\nخوش آمدید!\n\n— Hermes OS",
    footerTagline: "Hermes OS — هوش صنعتی مبتنی بر هوش مصنوعی",
    footerNote: "اگر این ایمیل را شما درخواست نکرده‌اید، نیازی به هیچ اقدامی نیست — می‌توانید آن را نادیده بگیرید.",
  },
  de: {
    subject: "Willkommen bei Hermes OS",
    title: "Willkommen bei Hermes OS",
    greeting: "Hallo {name}, Ihr Konto ist jetzt aktiv.",
    body: "Ihre E-Mail-Adresse wurde bestätigt und Ihr Hermes-OS-Konto ist vollständig aktiviert. Sie können sich jetzt anmelden und die Plattform nutzen.",
    featuresTitle: "Was Sie mit Hermes OS tun können",
    feature1: "KI-gestützte industrielle Ursachenanalyse",
    feature2: "Wissensgraph und technisches Gedächtnis",
    feature3: "Intelligente Dokumentensuche und -abfrage",
    cta: "Bei Hermes OS anmelden",
    support: "Bei Fragen wenden Sie sich an unser Support-Team. Wir helfen Ihnen gern.",
    preview: "Ihr Hermes-OS-Konto ist bereit — willkommen an Bord",
    textBody:
      "Hallo {name},\n\nIhre E-Mail-Adresse wurde bestätigt und Ihr Hermes-OS-Konto ist vollständig aktiviert.\n\nSie können sich jetzt anmelden und die Plattform nutzen:\n{link}\n\nWas Sie mit Hermes OS tun können:\n- KI-gestützte industrielle Ursachenanalyse\n- Wissensgraph und technisches Gedächtnis\n- Intelligente Dokumentensuche und -abfrage\n\nWillkommen an Bord!\n\n— Hermes OS",
    footerTagline: "Hermes OS — KI-gestützte industrielle Intelligenz",
    footerNote: "Wenn Sie diese E-Mail nicht angefordert haben, ist keine Aktion erforderlich — Sie können sie einfach ignorieren.",
  },
};

/** Subject helpers threaded to send() call sites. */
export function verificationEmailSubject(locale?: string | null): string {
  return VERIFICATION_STRINGS[resolveEmailLocale(locale)].subject;
}
export function passwordResetEmailSubject(locale?: string | null): string {
  return PASSWORD_RESET_STRINGS[resolveEmailLocale(locale)].subject;
}
export function welcomeEmailSubject(locale?: string | null): string {
  return WELCOME_STRINGS[resolveEmailLocale(locale)].subject;
}
