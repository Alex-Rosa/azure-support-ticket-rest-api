import { connection, type NextRequest } from "next/server";
import { getConfig } from "@/lib/server/config";
import { SESSION_COOKIE, getSession } from "@/lib/server/user-auth";

export async function GET(req: NextRequest) {
  // Read env at request time, not at build time.
  await connection();
  const config = getConfig();
  const session = config.authMode === "user" ? getSession(req.cookies.get(SESSION_COOKIE)?.value) : undefined;
  return Response.json({
    authMode: config.authMode,
    requestedAuthMode: config.requestedAuthMode,
    authWarning: config.authWarning,
    liveMode: config.liveMode,
    classifyEnabled: config.classifyEnabled,
    user: session ? { username: session.username, name: session.name } : null,
    signInRequired: config.authMode === "user" && !session,
  });
}
