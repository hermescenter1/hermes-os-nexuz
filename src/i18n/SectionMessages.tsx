import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { pickClientMessages, type ClientSection } from "./client-messages";

/**
 * Provides one route section's client messages: the shell plus the section's
 * own namespaces (see `client-namespaces.json`).
 *
 * It lives in each section's layout, not in the locale layout, because the
 * locale layout is not re-rendered on client-side navigation — messages picked
 * there for /articles would still be in place after navigating to /dashboard.
 * A nested provider REPLACES its parent's messages, which is why the shell is
 * included here as well.
 */
export async function SectionMessages({
  section,
  children,
}: {
  section: ClientSection;
  children: ReactNode;
}) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickClientMessages(messages, section)}>
      {children}
    </NextIntlClientProvider>
  );
}
