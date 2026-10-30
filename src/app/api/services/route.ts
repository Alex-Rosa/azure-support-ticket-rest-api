import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/handler";
import { getSupportClient } from "@/lib/server/support";

export const GET = handle(async (req: NextRequest) => {
  const services = await getSupportClient(req).listServices();
  return Response.json(services.sort((a, b) => a.properties.displayName.localeCompare(b.properties.displayName)));
});
