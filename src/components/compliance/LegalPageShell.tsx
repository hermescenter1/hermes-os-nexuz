import type { ReactNode } from "react";
import { Link }           from "@/i18n/navigation";

interface Props {
  title:     string;
  eyebrow:   string;
  version:   string;
  effective: string;
  children:  ReactNode;
}

export function LegalPageShell({ title, eyebrow, version, effective, children }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <div className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-signal/70 mb-2">{eyebrow}</p>
        <h1 className="font-mono text-2xl font-bold text-ink mb-3">{title}</h1>
        <div className="flex items-center gap-4 text-[11px] text-muted font-mono">
          <span>Version {version}</span>
          <span>·</span>
          <span>Effective {effective}</span>
        </div>
      </div>

      <div className="prose-legal space-y-6 text-sm text-ink/85 leading-relaxed">
        {children}
      </div>

      <div className="mt-12 border-t border-line pt-6 flex flex-wrap gap-4 text-xs text-muted font-mono">
        <Link href="/privacy"      className="hover:text-ink transition-colors">Privacy Policy</Link>
        <Link href="/terms"        className="hover:text-ink transition-colors">Terms of Service</Link>
        <Link href="/cookies"      className="hover:text-ink transition-colors">Cookie Policy</Link>
        <Link href="/gdpr"         className="hover:text-ink transition-colors">GDPR Rights</Link>
        <Link href="/data-request" className="hover:text-ink transition-colors">Data Request</Link>
      </div>
    </div>
  );
}
