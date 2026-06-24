"use client";

import { useState }   from "react";
import { Link }        from "@/i18n/navigation";
import { useRouter }   from "@/i18n/navigation";

export function CandidateRegisterClient() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", email: "", password: "", confirmPassword: "", phone: "", location: "",
  });
  const [submitting, setSub] = useState(false);
  const [error, setError]    = useState("");

  function set(field: keyof typeof form, val: string) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSub(true);
    setError("");
    try {
      const res = await fetch("/api/candidate/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:     form.name,
          email:    form.email,
          password: form.password,
          phone:    form.phone || undefined,
          location: form.location || undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Registration failed");
      } else {
        router.push("/candidate");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSub(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="eyebrow-label mb-2">HERMES OS · CANDIDATE PORTAL</p>
          <h1 className="type-page-title text-2xl">Create Account</h1>
          <p className="mt-2 text-sm text-muted">
            Register to track your applications and manage your candidate profile.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-line bg-surface p-6 space-y-4">
          <div>
            <label className="block mb-1.5 text-xs font-mono text-muted uppercase tracking-wide">Full Name *</label>
            <input
              required value={form.name} onChange={(e) => set("name", e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
            />
          </div>

          <div>
            <label className="block mb-1.5 text-xs font-mono text-muted uppercase tracking-wide">Email Address *</label>
            <input
              required type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1.5 text-xs font-mono text-muted uppercase tracking-wide">Phone</label>
              <input
                type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
              />
            </div>
            <div>
              <label className="block mb-1.5 text-xs font-mono text-muted uppercase tracking-wide">Location</label>
              <input
                value={form.location} onChange={(e) => set("location", e.target.value)}
                placeholder="City, Country"
                className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1.5 text-xs font-mono text-muted uppercase tracking-wide">Password *</label>
            <input
              required type="password" minLength={8} value={form.password}
              onChange={(e) => set("password", e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
            />
          </div>

          <div>
            <label className="block mb-1.5 text-xs font-mono text-muted uppercase tracking-wide">Confirm Password *</label>
            <input
              required type="password" value={form.confirmPassword}
              onChange={(e) => set("confirmPassword", e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger font-mono">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-signal py-2.5 text-sm font-mono font-semibold text-bg hover:bg-signal/90 transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating Account…" : "Create Account"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-signal hover:underline">Sign in</Link>
        </p>
        <p className="mt-2 text-center text-xs text-muted">
          <Link href="/careers" className="text-muted hover:text-ink transition-colors">Browse open positions →</Link>
        </p>
      </div>
    </div>
  );
}
