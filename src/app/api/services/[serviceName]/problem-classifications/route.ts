import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/handler";
import { getSupportClient } from "@/lib/server/support";

export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/services/[serviceName]/problem-classifications">) => {
  const { serviceName } = await ctx.params;
  const items = await getSupportClient(req).listProblemClassifications(serviceName);
  return Response.json(items.sort((a, b) => a.properties.displayName.localeCompare(b.properties.displayName)));
});
