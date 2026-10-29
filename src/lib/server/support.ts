import "server-only";
// Builds a SupportClient for the current request using the configured auth mode.
import { AzureCliCredential, ClientCertificateCredential, ClientSecretCredential, type TokenCredential } from "@azure/identity";
import type { NextRequest } from "next/server";
import { ArmError, SupportClient } from "@/lib/azure-support";
import { getConfig } from "./config";
import { SESSION_COOKIE, getUserToken } from "./user-auth";

const ARM_SCOPE = "https://management.azure.com/.default";

const globalState = globalThis as unknown as { __asmCredential?: { key: string; credential: TokenCredential } };

function appCredential(): TokenCredential {
  const { authMode, servicePrincipal: sp } = getConfig();
  const key = `${authMode}:${sp.tenantId}:${sp.clientId}:${sp.certificatePath ?? ""}`;
  if (globalState.__asmCredential?.key === key) return globalState.__asmCredential.credential;

  let credential: TokenCredential;
  if (authMode === "service-principal") {
    if (!sp.tenantId || !sp.clientId || !(sp.clientSecret || sp.certificatePath)) {
      throw new ArmError(
        500,
        "AuthNotConfigured",
        "AUTH_MODE=service-principal needs AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET or AZURE_CLIENT_CERTIFICATE_PATH.",
      );
    }
    credential = sp.certificatePath
      ? new ClientCertificateCredential(sp.tenantId, sp.clientId, { certificatePath: sp.certificatePath })
      : new ClientSecretCredential(sp.tenantId, sp.clientId, sp.clientSecret!);
  } else {
    credential = new AzureCliCredential();
  }
  globalState.__asmCredential = { key, credential };
  return credential;
}

export function getSupportClient(request: NextRequest): SupportClient {
  const { authMode } = getConfig();
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;

  return new SupportClient({
    getToken: async () => {
      if (authMode === "user") {
        const token = await getUserToken(sessionId).catch(() => undefined);
        if (!token) throw new ArmError(401, "SignInRequired", "Sign in with your Microsoft account to continue.");
        return token;
      }
      try {
        const token = await appCredential().getToken(ARM_SCOPE);
        if (!token) throw new Error("No token returned.");
        return token.token;
      } catch (err) {
        if (err instanceof ArmError) throw err;
        const hint = authMode === "cli" ? " Run `az login` and try again." : "";
        throw new ArmError(401, "CredentialUnavailable", `${(err as Error).message}${hint}`);
      }
    },
  });
}
