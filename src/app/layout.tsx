import type { ReactNode } from "react";

// The real <html>/<body> live in [locale]/layout.tsx so dir/lang can be
// set per-locale. This root layout exists to satisfy the App Router.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
