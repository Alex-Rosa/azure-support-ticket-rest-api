import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/handler";
import { getSupportClient } from "@/lib/server/support";

export const GET = handle(async (req: NextRequest) => {
  const subscriptions = await getSupportClient(req).listSubscriptions();
  return Response.json(subscriptions.sort((a, b) => a.displayName.localeCompare(b.displayName)));
});
