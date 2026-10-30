import type { NextRequest } from "next/server";
import { getConfig } from "@/lib/server/config";
import { SESSION_COOKIE, completeLogin } from "@/lib/server/user-auth";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const { baseUrl } = getConfig();
  const fail = (message: string) =>
    Response.redirect(`${baseUrl}/?authError=${encodeURIComponent(message)}`, 302);

  const error = params.get("error_description") ?? params.get("error");
  if (error) return fail(error);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return fail("Missing authorization code.");

  try {
    const { sessionId, returnTo } = await completeLogin(code, state);
    const headers = new Headers({ Location: `${baseUrl}${returnTo}` });
    headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax${baseUrl.startsWith("https") ? "; Secure" : ""}`,
    );
    return new Response(null, { status: 302, headers });
  } catch (err) {
    return fail((err as Error).message);
  }
}
