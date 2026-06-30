"use client";

import { useRef, useState } from "react";

interface Props {
  initialAvatarUrl: string | null;
  displayName:      string;
  isFa:             boolean;
}

function Initials({ name }: { name: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-signal/35 to-ice/25 border-2 border-signal/30 flex items-center justify-center text-4xl font-bold text-signal shadow-[0_0_30px_rgba(30,200,164,0.12)]">
      {letter}
    </div>
  );
}

export function AvatarSettingsClient({ initialAvatarUrl, displayName, isFa }: Props) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [busy,      setBusy]      = useState(false);
  const [banner,    setBanner]    = useState<{ ok: boolean; msg: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const T = {
    title:       isFa ? "تنظیمات پروفایل نویسنده"        : "Author Profile Settings",
    section:     isFa ? "عکس پروفایل"                    : "Profile Photo",
    hint:        isFa ? "فقط JPG، PNG یا WebP تا ۲ مگابایت مجاز است." : "JPG, PNG, or WebP up to 2MB only.",
    upload:      isFa ? "بارگذاری عکس"                   : "Upload Photo",
    change:      isFa ? "تغییر عکس"                      : "Change Photo",
    remove:      isFa ? "حذف عکس"                        : "Remove Photo",
    successUp:   isFa ? "عکس پروفایل به‌روزرسانی شد."    : "Profile photo updated.",
    successDel:  isFa ? "عکس پروفایل حذف شد."           : "Profile photo removed.",
    errType:     isFa ? "فایل مجاز نیست. فقط JPG، PNG یا WebP." : "Invalid file. JPG, PNG, or WebP only.",
    errSize:     isFa ? "فایل بیش از ۲ مگابایت است."    : "File exceeds 2MB limit.",
    errGeneric:  isFa ? "خطا در بارگذاری. دوباره تلاش کنید." : "Upload failed. Please try again.",
  };

  function flashBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    setTimeout(() => setBanner(null), 4000);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      flashBanner(false, T.errType);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      flashBanner(false, T.errSize);
      return;
    }

    setBusy(true);
    setBanner(null);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch("/api/articles/author-profile/avatar", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok || !data.ok) {
        flashBanner(false, (typeof data.error === "string" ? data.error : null) ?? T.errGeneric);
      } else {
        setAvatarUrl(typeof data.avatarUrl === "string" ? data.avatarUrl : null);
        flashBanner(true, T.successUp);
      }
    } catch {
      flashBanner(false, T.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!avatarUrl) return;
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch("/api/articles/author-profile/avatar", { method: "DELETE" });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok || !data.ok) {
        flashBanner(false, T.errGeneric);
      } else {
        setAvatarUrl(null);
        flashBanner(true, T.successDel);
      }
    } catch {
      flashBanner(false, T.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-20"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.14) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-2xl mx-auto px-6 py-10">
          <p className="eyebrow-mono text-signal text-[9px] mb-2 tracking-[0.2em]">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-2xl font-bold text-ink">{T.title}</h1>
          <p className="text-xs text-muted mt-1">
            {isFa ? "مدیریت عکس پروفایل نویسنده" : "Manage your author profile photo"}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Banner */}
        {banner && (
          <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${
            banner.ok
              ? "bg-signal/[0.06] border-signal/25 text-signal"
              : "bg-danger/[0.06] border-danger/25 text-danger"
          }`}>
            {banner.msg}
          </div>
        )}

        {/* Avatar card */}
        <div className="rounded-xl border border-line/40 bg-surface/60 p-6">
          <div className="h-0.5 -mx-6 -mt-6 mb-6 bg-gradient-to-r from-signal/30 to-transparent" />
          <p className="text-xs font-bold text-ink uppercase tracking-wider mb-5 font-mono">{T.section}</p>

          <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
            {/* Preview */}
            <div className="relative shrink-0">
              {avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={avatarUrl}
                  alt={`${displayName} profile photo`}
                  width={96}
                  height={96}
                  className="w-24 h-24 rounded-2xl object-cover border-2 border-signal/30 shadow-[0_0_30px_rgba(30,200,164,0.12)]"
                />
              ) : (
                <Initials name={displayName} />
              )}
              {busy && (
                <div className="absolute inset-0 rounded-2xl bg-bg/70 flex items-center justify-center">
                  <svg className="w-5 h-5 text-signal animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-signal/30 bg-signal/5 text-signal text-xs font-semibold hover:bg-signal/10 hover:border-signal/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909.47.47a.75.75 0 1 1-1.06 1.06L6.53 8.091a.75.75 0 0 0-1.06 0l-2.97 2.97ZM12 7a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" clipRule="evenodd"/>
                  </svg>
                  {avatarUrl ? T.change : T.upload}
                </button>
                {avatarUrl && (
                  <button
                    disabled={busy}
                    onClick={handleRemove}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-danger/30 bg-danger/5 text-danger text-xs font-semibold hover:bg-danger/10 hover:border-danger/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd"/>
                    </svg>
                    {T.remove}
                  </button>
                )}
              </div>
              <p className="text-[10px] text-faint font-mono">{T.hint}</p>
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={handleFileChange}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
