import "server-only";

export type AuthMode = "cli" | "service-principal" | "user";

export interface AppConfig {
  /** Mode requested in AUTH_MODE. */
  requestedAuthMode: AuthMode;
  /** Mode actually in use (user sign-in falls back to cli until configured). */
  authMode: AuthMode;
  authWarning?: string;
  liveMode: boolean;
  classifyEnabled: boolean;
  baseUrl: string;
  servicePrincipal: {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
    certificatePath?: string;
  };
  userSignIn: {
    tenantId: string;
    clientId?: string;
    clientSecret?: string;
  };
}

const truthy = (v: string | undefined) => ["1", "true", "yes"].includes((v ?? "").trim().toLowerCase());

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const raw = (env.AUTH_MODE ?? "cli").trim().toLowerCase();
  const requestedAuthMode: AuthMode = raw === "service-principal" || raw === "user" ? raw : "cli";

  const userSignIn = {
    tenantId: env.AZURE_AD_TENANT_ID || "organizations",
    clientId: env.AZURE_AD_CLIENT_ID,
    clientSecret: env.AZURE_AD_CLIENT_SECRET,
  };
  const servicePrincipal = {
    tenantId: env.AZURE_TENANT_ID,
    clientId: env.AZURE_CLIENT_ID,
    clientSecret: env.AZURE_CLIENT_SECRET,
    certificatePath: env.AZURE_CLIENT_CERTIFICATE_PATH,
  };

  let authMode = requestedAuthMode;
  let authWarning: string | undefined;
  if (requestedAuthMode === "user" && !(userSignIn.clientId && userSignIn.clientSecret)) {
    authMode = "cli";
    authWarning =
      "AUTH_MODE=user needs AZURE_AD_CLIENT_ID and AZURE_AD_CLIENT_SECRET (see docs/SETUP.md). Using Azure CLI credentials instead.";
  }

  return {
    requestedAuthMode,
    authMode,
    authWarning,
    liveMode: truthy(env.SUPPORT_LIVE_MODE),
    classifyEnabled: env.SUPPORT_CLASSIFY_ENABLED === undefined ? true : truthy(env.SUPPORT_CLASSIFY_ENABLED),
    baseUrl: (env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, ""),
    servicePrincipal,
    userSignIn,
  };
}
