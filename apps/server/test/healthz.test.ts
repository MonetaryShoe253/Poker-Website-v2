import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("server boot", () => {
  it("answers /healthz", async () => {
    const app = await buildServer();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    await app.close();
  });
});
