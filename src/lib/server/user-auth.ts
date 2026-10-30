import "server-only";
// Browser sign-in with Entra ID (auth code + PKCE) via MSAL Node.
// The app runs locally for one person, so sessions and the MSAL token cache
// live in process memory; restarting the dev server signs you out.
import { ConfidentialClientApplication, CryptoProvider } from "@azure/msal-node";
import { getConfig } from "./config";

export const SESSION_COOKIE = "asm_session";
export const ARM_SCOPES = ["https://management.azure.com/user_impersonation"];

interface PendingLogin {
  verifier: string;
  returnTo: string;
  createdAt: number;
}

interface UserSession {
  homeAccountId: string;
  username: string;
  name?: string;
}

interface AuthState {
  msal?: ConfidentialClientApplication;
  pending: Map<string, PendingLogin>;
  sessions: Map<string, UserSession>;
}

// Survive Next.js dev hot reloads.
const globalState = globalThis as unknown as { __asmAuth?: AuthState };
const state: AuthState = (globalState.__asmAuth ??= { pending: new Map(), sessions: new Map() });

const crypto = new CryptoProvider();

export function redirectUri() {
  return `${getConfig().baseUrl}/api/auth/callback`;
}

function msal(): ConfidentialClientApplication {
  if (state.msal) return state.msal;
  const { userSignIn } = getConfig();
  if (!userSignIn.clientId || !userSignIn.clientSecret) {
    throw new Error("User sign-in is not configured. Set AZURE_AD_CLIENT_ID and AZURE_AD_CLIENT_SECRET.");
  }
  state.msal = new ConfidentialClientApplication({
    auth: {
      clientId: userSignIn.clientId,
      clientSecret: userSignIn.clientSecret,
      authority: `https://login.microsoftonline.com/${userSignIn.tenantId}`,
    },
  });
  return state.msal;
}

/** Only allow same-app relative paths as post-login destinations. */
export function safeReturnTo(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function beginLogin(returnTo: string): Promise<string> {
  const { verifier, challenge } = await crypto.generatePkceCodes();
  const loginState = crypto.createNewGuid();
  const cutoff = Date.now() - 10 * 60_000;
  for (const [key, p] of state.pending) if (p.createdAt < cutoff) state.pending.delete(key);
  state.pending.set(loginState, { verifier, returnTo: safeReturnTo(returnTo), createdAt: Date.now() });
  return msal().getAuthCodeUrl({
    scopes: ARM_SCOPES,
    redirectUri: redirectUri(),
    state: loginState,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    prompt: "select_account",
  });
}

/** Completes the code exchange; returns the new session ID and where to go next. */
export async function completeLogin(code: string, loginState: string) {
  const pending = state.pending.get(loginState);
  if (!pending) throw new Error("Unknown or expired sign-in attempt. Please sign in again.");
  state.pending.delete(loginState);

  const result = await msal().acquireTokenByCode({
    code,
    scopes: ARM_SCOPES,
    redirectUri: redirectUri(),
    codeVerifier: pending.verifier,
  });
  if (!result.account) throw new Error("Sign-in returned no account.");

  const sessionId = crypto.createNewGuid();
  state.sessions.set(sessionId, {
    homeAccountId: result.account.homeAccountId,
    username: result.account.username,
    name: result.account.name,
  });
  return { sessionId, returnTo: pending.returnTo };
}

export function getSession(sessionId: string | undefined): UserSession | undefined {
  return sessionId ? state.sessions.get(sessionId) : undefined;
}

export function endSession(sessionId: string | undefined) {
  if (sessionId) state.sessions.delete(sessionId);
}

export async function getUserToken(sessionId: string | undefined): Promise<string | undefined> {
  const session = getSession(sessionId);
  if (!session) return undefined;
  const account = await msal().getTokenCache().getAccountByHomeId(session.homeAccountId);
  if (!account) return undefined;
  const result = await msal().acquireTokenSilent({ account, scopes: ARM_SCOPES });
  return result.accessToken;
}
