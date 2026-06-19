"use client";

import { useState, useRef } from "react";

interface Props {
  onSearch:    (q: string) => void;
  placeholder?: string;
}

export function KnowledgeSearchBar({ onSearch, placeholder }: Props) {
  const [value, setValue] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => onSearch(v), 400);
  }

  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder ?? "Search…"}
        dir="auto"
        className="
          w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 py-2
          text-white text-sm placeholder:text-white/25
          focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20
          transition-colors
        "
      />
    </div>
  );
}
