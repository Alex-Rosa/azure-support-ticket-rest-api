import { afterEach, describe, expect, it, vi } from "vitest";
import { guardedWrite } from "@/lib/server/handler";
import { getConfig } from "@/lib/server/config";

const plan = () => ({ method: "PUT", url: "https://management.azure.com/x", body: { a: 1 } });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("guardedWrite", () => {
  it("never executes when live mode is off, even with confirm", async () => {
    vi.stubEnv("SUPPORT_LIVE_MODE", "");
    const execute = vi.fn();
    const res = await guardedWrite(true, plan, execute, "ticket-1");
    expect(execute).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ dryRun: true, request: plan(), name: "ticket-1" });
  });

  it("returns the plan when live but not confirmed", async () => {
    vi.stubEnv("SUPPORT_LIVE_MODE", "true");
    const execute = vi.fn();
    const res = await guardedWrite(undefined, plan, execute);
    expect(execute).not.toHaveBeenCalled();
    expect((await res.json()).dryRun).toBe(true);
  });

  it("executes only when live and confirmed", async () => {
    vi.stubEnv("SUPPORT_LIVE_MODE", "true");
    const res = await guardedWrite(true, plan, async () => ({ id: "t1" }));
    expect(await res.json()).toEqual({ dryRun: false, result: { id: "t1" } });
  });
});

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe("getConfig", () => {
  it("defaults to Azure CLI auth and dry-run", () => {
    const config = getConfig(env({}));
    expect(config).toMatchObject({ authMode: "cli", liveMode: false, classifyEnabled: true });
  });

  it("falls back to CLI when user sign-in isn't configured", () => {
    const config = getConfig(env({ AUTH_MODE: "user" }));
    expect(config.requestedAuthMode).toBe("user");
    expect(config.authMode).toBe("cli");
    expect(config.authWarning).toMatch(/AZURE_AD_CLIENT_ID/);
  });

  it("uses user sign-in when configured", () => {
    const config = getConfig(env({ AUTH_MODE: "user", AZURE_AD_CLIENT_ID: "id", AZURE_AD_CLIENT_SECRET: "secret" }));
    expect(config.authMode).toBe("user");
    expect(config.userSignIn.tenantId).toBe("organizations");
  });
});
