import { createAuthClient } from "better-auth/react";

/** Same-origin in dev (Vite proxies /api) and in production. */
export const authClient = createAuthClient({
  baseURL: "",
  basePath: "/api/auth",
});
