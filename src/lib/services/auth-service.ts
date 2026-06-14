import type { AuthService } from "./types";

// V1 demo: no real auth yet. Phase 2: FastAPI auth microservice.
export const authService: AuthService = {
  async currentUser() {
    return { ok: true, data: null };
  },
};
