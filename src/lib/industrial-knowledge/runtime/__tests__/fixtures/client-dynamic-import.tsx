"use client";
// FIXTURE — a dynamic import with a literal specifier. It defers WHEN the
// module loads, not WHETHER it ships: the bundler still emits a client chunk
// containing the bridge, so this is a leak like any other.
import { useState } from "react";

export function DynamicImportFixture() {
  const [systems, setSystems] = useState(0);
  return (
    <button
      type="button"
      onClick={async () => {
        const mod = await import("@/lib/industrial-knowledge/runtime/bridge");
        setSystems(mod.bridgeFingerprint().systems);
      }}
    >
      {systems}
    </button>
  );
}
