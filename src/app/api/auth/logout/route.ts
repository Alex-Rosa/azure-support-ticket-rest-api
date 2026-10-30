import type { NextRequest } from "next/server";
import { SESSION_COOKIE, endSession } from "@/lib/server/user-auth";

export async function POST(req: NextRequest) {
  endSession(req.cookies.get(SESSION_COOKIE)?.value);
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` },
  });
}
