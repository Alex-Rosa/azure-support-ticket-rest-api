import type { NextRequest } from "next/server";
import { handle, scopeFrom } from "@/lib/server/handler";
import { getSupportClient } from "@/lib/server/support";

export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/tickets/[name]/chat-transcripts">) => {
  const { name } = await ctx.params;
  return Response.json(await getSupportClient(req).listChatTranscripts(scopeFrom(req), name));
});
