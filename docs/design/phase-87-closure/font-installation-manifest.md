# Font installation manifest — canonical typography for the Figma file

> Owner-facing. The Hermes Design System Builder plugin **fails closed** on
> Apply when the canonical desktop fonts below are not installed — unless the
> owner explicitly ticks *"Allow documented font fallback"* in the plugin UI.
> Nothing here is downloaded or installed by the agent/plugin; installation is
> a deliberate owner action.

## Why

The product's canonical typography is **Estedad** (display) + **Vazirmatn**
(body). The repository ships them as self-hosted **variable web fonts**
(woff2, weight axis 100–900) loaded via `next/font/local` — correct for the
web app, but **Figma does not read web fonts**: it lists **OS-installed
desktop fonts**. The first Apply therefore reported honest fallbacks
(`Estedad Bold → Inter Bold`, `Vazirmatn Semi Bold → Vazirmatn Regular`).
Installing the official desktop builds closes this permanently.

## Repository assets already present (web-only — NOT installable in Figma)

| File | SHA-256 | License |
|---|---|---|
| `src/fonts/Estedad.woff2` (variable 100–900) | `18a2278ad5c9c2f60e034270ea2d5856d04c4e984e47c65483aa63b41e3c5a1e` | SIL OFL 1.1 (`src/fonts/OFL-Estedad.txt`) |
| `src/fonts/Vazirmatn.woff2` (variable 100–900) | `4e3fa217d38fdafc1fea4414ceb58ca5e662cf0ab5fa735a8c8c20e8b42cad92` | SIL OFL 1.1 (`src/fonts/OFL.txt`) |
| `src/fonts/Inter.woff2` (variable, latin) | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` | SIL OFL 1.1 (`src/fonts/OFL-Inter.txt`) |

## What to install (official upstream desktop builds)

### 1. Estedad — display family

- **Upstream:** https://github.com/aminabedi68/Estedad (SIL OFL 1.1, `OFL.txt` at repo root) — VERIFIED
- **Download:** https://github.com/aminabedi68/Estedad/releases → latest release zip (verified latest at research time: `Estedad-v8.5.zip`, tag `8.5`)
- **Install these static TTFs** (from the zip's `fonts/ttf/`):
  `Estedad-Regular.ttf` · `Estedad-Medium.ttf` · `Estedad-SemiBold.ttf` · `Estedad-Bold.ttf`
  (the other five weights are optional; do **not** additionally install the
  variable `Estedad[wght].ttf` alongside the statics — duplicate family
  listings can result)
- **Installed family name:** `Estedad` (VERIFIED — v8.4 release note fixed the
  variable-font name back to "Estedad"; Google Fonts metadata concurs).
  ⚠ If an **older** Estedad variable font is already installed, uninstall it
  first (pre-8.4 builds used a different family name).
- **Style spellings:** **no-space** `SemiBold` (file names verified; the
  plugin's weight-name aliasing accepts `Semi Bold`/`SemiBold`/`600` equally).

### 2. Vazirmatn — body family

- **Upstream:** https://github.com/rastikerdar/vazirmatn (SIL OFL 1.1) — VERIFIED
- **Download:** https://github.com/rastikerdar/vazirmatn/releases → latest release zip (verified latest: `vazirmatn-v33.003.zip`, tag `v33.003`)
- **Install these static TTFs** (from `fonts/ttf/`):
  `Vazirmatn-Regular.ttf` · `Vazirmatn-Medium.ttf` · `Vazirmatn-SemiBold.ttf` · `Vazirmatn-Bold.ttf`
  ⚠ The zip also contains `Round-Dots/` and `misc/` variant families (Farsi
  digits, UI builds) — **do not install those**; their family names differ.
- **Installed family name:** `Vazirmatn` (VERIFIED via upstream README + Google Fonts metadata).
- **Style spellings:** no-space `SemiBold` (same aliasing note as above).

### Required weights (what the plugin's type ramp actually needs)

| Family | Weights required | Used by |
|---|---|---|
| Estedad | Bold, SemiBold | Display/XL · Heading/L · Heading/M |
| Vazirmatn | Regular, Medium, SemiBold | Title/S · Body/M · Body/S · Caption |

(The mono ramp uses a generic monospace chain by design and does not gate.)

## Windows installation + verification

1. Download the release zip from the official releases page and **extract it**
   (Windows cannot install fonts from inside a zip).
2. Select the listed TTFs → right-click → *Show more options* →
   **Install for all users** (recommended; needs admin; lands in
   `C:\Windows\Fonts`). Per-user **Install** also works.
3. Verify in Windows: **Settings → Personalization → Fonts** → search
   `Estedad` / `Vazirmatn` → the family entry must list Regular, Medium,
   SemiBold, Bold.
4. **Restart Figma Desktop** (or reload open files). Verify in Figma: any text
   layer → font menu → filter **"Installed by you"** → both families appear
   with the weights above. (Figma Desktop bundles its font access — no extra
   agent needed.)
5. Re-run the plugin: **Dry Run** should now report
   `✅ Canonical fonts present.` — then **Apply** updates the 8 text styles to
   the canonical fonts and re-renders text with them. Any remaining
   substitution would be listed explicitly in the Apply report (never silent).

## Fail-closed contract (plugin behavior)

- Canonical fonts present → Apply proceeds; name-aliases (`SemiBold` ≈
  `Semi Bold`) are reported separately from substitutions.
- Canonical fonts missing + fallback checkbox **unchecked** → Apply is
  **blocked** (`FONTS_MISSING`), nothing is written.
- Canonical fonts missing + fallback checkbox **checked** → Apply proceeds with
  the documented Inter/Regular fallback and reports every substitution.
