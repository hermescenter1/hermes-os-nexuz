"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { errorStyle, successStyle } from "./AuthShell";

interface Props {
  locale: string;
  token:  string;
}

export function VerifyEmailClient({ locale, token }: Props) {
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token provided.");
      return;
    }

    let cancelled = false;
    fetch("/api/auth/verify-email", {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        if (cancelled) return;
        if (data.ok) {
          setStatus("success");
          setMessage(String(data.message ?? "Email verified successfully!"));
        } else {
          setStatus("error");
          setMessage(String(data.error ?? "Verification failed."));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        setMessage("Unable to connect. Please try again.");
      });

    return () => { cancelled = true; };
  }, [token]);

  if (status === "pending") {
    return (
      <div className="text-center py-4">
        <div className="inline-block w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "rgba(45,212,191,0.4)", borderTopColor: "transparent" }}
        />
        <p className="mt-3 text-sm" style={{ color: "rgba(140,178,215,0.75)" }}>Verifying your email…</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="space-y-4 text-center">
        {/* Checkmark icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.25)" }}>
            <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
              <path d="M5 13l4 4L19 7" stroke="#2DD4BF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        <p style={successStyle}>{message}</p>
        <Link
          href={`/${locale}/auth/login`}
          className="inline-block text-sm hover:underline"
          style={{ color: "#2DD4BF" }}
        >
          Sign in to your account →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <p style={errorStyle}>{message}</p>
      <div className="flex flex-col gap-2">
        <Link href={`/${locale}/auth/login`} className="text-sm hover:underline" style={{ color: "#2DD4BF" }}>
          ← Back to sign in
        </Link>
        <Link href={`/${locale}/auth/forgot-password`} className="text-sm hover:underline" style={{ color: "rgba(140,178,215,0.60)" }}>
          Resend verification email (via forgot password)
        </Link>
      </div>
    </div>
  );
}
