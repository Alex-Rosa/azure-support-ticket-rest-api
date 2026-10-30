import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/handler";
import { beginLogin } from "@/lib/server/user-auth";

export const GET = handle(async (req: NextRequest) => {
  const url = await beginLogin(req.nextUrl.searchParams.get("returnTo") ?? "/");
  return Response.redirect(url, 302);
});
