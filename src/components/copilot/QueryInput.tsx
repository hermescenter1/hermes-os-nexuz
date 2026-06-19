"use client";

import { useState }          from "react";
import { useTranslations }   from "next-intl";

interface Props {
  onSubmit: (query: string) => void;
  loading?:  boolean;
}

export default function QueryInput({ onSubmit, loading }: Props) {
  const t    = useTranslations("copilot");
  const [v, setV] = useState("");

  const submit = () => {
    const q = v.trim();
    if (!q || loading) return;
    onSubmit(q);
    setV("");
  };

  return (
    <div className="flex gap-2">
      <input
        className="flex-1 rounded border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-400/50"
        placeholder={t("queryPlaceholder")}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        disabled={loading}
      />
      <button
        onClick={submit}
        disabled={loading || !v.trim()}
        className="rounded border border-cyan-400/40 px-4 py-2 text-cyan-400 text-sm font-mono hover:bg-cyan-400/10 disabled:opacity-40 transition-colors"
      >
        {loading ? "…" : t("send")}
      </button>
    </div>
  );
}
