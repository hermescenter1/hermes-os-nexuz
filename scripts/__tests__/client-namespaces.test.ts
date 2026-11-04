import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  REPO_ROOT,
  MANIFEST_PATH,
  computeClientNamespaces,
  namespacesOfSource,
  serializeManifest,
} from "../i18n/client-namespaces.mjs";
import { pickClientMessages } from "../../src/i18n/client-messages";
import manifest from "../../src/i18n/client-namespaces.json";
import en from "../../messages/en.json";
import fa from "../../messages/fa.json";
import de from "../../messages/de.json";

/**
 * Client message scoping. Every page used to ship the whole catalog
 * (450–500 KB of JSON) to the client; now the locale layout ships the shell
 * and each route section's layout adds its own namespaces. A namespace a
 * client component reads but its section does not receive renders as a raw
 * key, so these tests pin the manifest to the source and the source to the
 * manifest.
 */

const LOCALE_DIR = join(REPO_ROOT, "src", "app", "[locale]");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("namespacesOfSource", () => {
  it("reads literal, nested and template-head namespaces", () => {
    const { names, unresolved } = namespacesOfSource(`
      const a = useTranslations("journal");
      const b = useTranslations('publicSite.footer');
      const c = useTranslations(\`publicSite.story.\${key}\`);
    `);
    expect([...names].sort()).toEqual(["journal", "publicSite"]);
    expect(unresolved).toEqual([]);
  });

  it("reads the top-level keys of a typed useMessages()", () => {
    const { names, unresolved } = namespacesOfSource(`
      const msgs = useMessages() as {
        knowledge?: Record<string, { name?: string; summary?: string }>;
        brain?: { cases?: Record<string, string> };
        knowledgeCases?: Record<string, string>;
      };
    `);
    expect([...names].sort()).toEqual(["brain", "knowledge", "knowledgeCases"]);
    expect(unresolved).toEqual([]);
  });

  it("reports what it cannot resolve, so the section falls back to the full catalog", () => {
    const { unresolved } = namespacesOfSource(`
      const a = useTranslations(namespace);
      const b = useTranslations();
      const m = useMessages();
    `);
    expect(unresolved).toEqual(["useTranslations(namespace)", "useTranslations()", "useMessages()"]);
  });

  it("lets a file declare the namespaces of its dynamic calls", () => {
    const { names, unresolved } = namespacesOfSource(`
      // client-namespaces: assetOperations maintenanceOperations
      const t = useTranslations(namespace);
    `);
    expect([...names].sort()).toEqual(["assetOperations", "maintenanceOperations"]);
    expect(unresolved).toEqual([]);
  });
});

describe("client-namespaces.json", () => {
  // The scan reads every source file (~2,000); on a loaded machine that alone
  // can exceed the suite's 60 s test timeout, so it gets its own budget.
  let regenerated = "";
  beforeAll(() => {
    regenerated = serializeManifest(computeClientNamespaces(REPO_ROOT));
  }, 180_000);

  it("is current — regenerate with: npm run i18n:client-namespaces", () => {
    expect(read(join(REPO_ROOT, MANIFEST_PATH))).toBe(regenerated);
  });

  it("names only namespaces that exist in all three catalogs", () => {
    const listed = new Set<string>(manifest.shell);
    for (const own of Object.values(manifest.sections)) {
      if (Array.isArray(own)) own.forEach((n) => listed.add(n));
    }
    for (const [locale, catalog] of Object.entries({ en, fa, de })) {
      for (const name of listed) expect(catalog, `${locale}: ${name}`).toHaveProperty(name);
    }
  });

  it("keeps the shell small and every public section scoped", () => {
    const sections = manifest.sections as Record<string, string[] | "*">;
    for (const section of ["", "about", "articles", "careers", "contact", "demo", "pricing", "privacy", "services", "terms"]) {
      expect(sections[section], `section "${section}"`).not.toBe("*");
    }
    expect(manifest.shell.length).toBeLessThanOrEqual(4);
  });
});

describe("provider wiring", () => {
  const sectionDirs = readdirSync(LOCALE_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "__tests__" && e.name !== "[...unmatched]")
    .map((e) => e.name)
    .sort();

  it("the manifest covers exactly the route sections", () => {
    expect(Object.keys(manifest.sections).filter((s) => s !== "").sort()).toEqual(sectionDirs);
  });

  it.each(sectionDirs)("%s/layout.tsx wraps its whole output in its own SectionMessages", (dir) => {
    const file = join(LOCALE_DIR, dir, "layout.tsx");
    expect(existsSync(file), `${dir} has no layout.tsx`).toBe(true);
    const src = read(file);
    expect(src).toMatch(new RegExp(`return \\(?\\s*<SectionMessages section="${dir.replace(/[-]/g, "\\-")}">`));
  });

  it("the home page wraps its output in the home section", () => {
    expect(read(join(LOCALE_DIR, "page.tsx"))).toMatch(/return \(\s*<SectionMessages section="">/);
  });

  it("the locale layout ships the shell only, never the whole catalog", () => {
    const src = read(join(LOCALE_DIR, "layout.tsx"));
    expect(src).toContain("const messages = pickClientMessages(await getMessages());");
    expect(src).toContain("<NextIntlClientProvider messages={messages}>");
  });
});

describe("pickClientMessages", () => {
  const catalog = en as unknown as Record<string, unknown>;

  it("gives the locale layout the shell only", () => {
    expect(Object.keys(pickClientMessages(catalog as never)).sort()).toEqual([...manifest.shell].sort());
  });

  it("gives a section the shell plus its own namespaces", () => {
    const own = manifest.sections.articles as string[];
    const keys = Object.keys(pickClientMessages(catalog as never, "articles")).sort();
    expect(keys).toEqual([...new Set([...manifest.shell, ...own])].sort());
    expect(keys).not.toContain("dashboard");
  });

  it("gives an unresolved section the whole catalog", () => {
    const fullSection = Object.entries(manifest.sections).find(([, v]) => v === "*")?.[0];
    if (fullSection === undefined) return;
    expect(pickClientMessages(catalog as never, fullSection as never)).toBe(catalog);
  });
});
