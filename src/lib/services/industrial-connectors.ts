import type { IndustrialConnectors } from "./types";

const NOT_YET = "industrial-connectors: implemented alongside dashboard";

export const industrialConnectors: IndustrialConnectors = {
  async list() {
    return { ok: false, error: NOT_YET };
  },
};
