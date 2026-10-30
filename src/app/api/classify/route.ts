import type { NextRequest } from "next/server";
import { z } from "zod";
import { ArmError, parseScope } from "@/lib/azure-support";
import { getConfig } from "@/lib/server/config";
import { handle, parseBody } from "@/lib/server/handler";
import { getSupportClient } from "@/lib/server/support";

const schema = z.object({
  subscriptionId: z.string(),
  serviceName: z.string().min(1),
  issueSummary: z.string().trim().min(10),
  resourceId: z.string().startsWith("/subscriptions/").optional(),
});

/** Suggests problem classifications (preview API; subscription scope only). */
export const POST = handle(async (req: NextRequest) => {
  if (!getConfig().classifyEnabled) {
    throw new ArmError(404, "ClassifyDisabled", "Classification suggestions are disabled (SUPPORT_CLASSIFY_ENABLED=false).");
  }
  const { subscriptionId, serviceName, issueSummary, resourceId } = await parseBody(req, schema);
  const scope = parseScope(subscriptionId);
  if (scope.kind !== "subscription") {
    throw new ArmError(400, "SubscriptionRequired", "Classification suggestions need a subscription.");
  }
  const results = await getSupportClient(req).classifyProblems(scope.subscriptionId, serviceName, {
    issueSummary,
    resourceId,
  });
  return Response.json(results);
});
