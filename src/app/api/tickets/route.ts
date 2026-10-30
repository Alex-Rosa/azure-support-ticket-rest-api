import type { NextRequest } from "next/server";
import { z } from "zod";
import { ArmError, buildCreateTicketBody, createTicketSchema, newResourceName } from "@/lib/azure-support";
import { guardedWrite, handle, parseBody, scopeFrom } from "@/lib/server/handler";
import { getSupportClient } from "@/lib/server/support";

export const GET = handle(async (req: NextRequest) => {
  const client = getSupportClient(req);
  const params = req.nextUrl.searchParams;
  const nextLink = params.get("nextLink");
  if (nextLink) return Response.json(await client.listTicketsNextPage(nextLink));

  const top = Math.min(Math.max(Number(params.get("top") ?? 50) || 50, 1), 100);
  const page = await client.listTickets(
    scopeFrom(req),
    {
      status: params.get("status") ?? undefined,
      createdAfter: params.get("createdAfter") ?? undefined,
      serviceId: params.get("serviceId") ?? undefined,
    },
    top,
  );
  return Response.json(page);
});

const resourceName = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);

const createEnvelope = z.object({
  confirm: z.boolean().optional(),
  /** Reuse the name from the dry run so the confirmed request matches what was reviewed. */
  name: resourceName.optional(),
  input: createTicketSchema,
});

export const POST = handle(async (req: NextRequest) => {
  const scope = scopeFrom(req);
  const { confirm, name: requestedName, input } = await parseBody(req, createEnvelope);
  const client = getSupportClient(req);
  const name = requestedName ?? newResourceName("ticket");
  const body = buildCreateTicketBody(input);

  return guardedWrite(
    confirm,
    () => client.planCreateTicket(scope, name, body),
    async () => {
      const availability = await client.checkTicketName(scope, name);
      if (!availability.nameAvailable) {
        throw new ArmError(409, "NameUnavailable", availability.message ?? `Ticket name ${name} is not available.`);
      }
      return client.createTicket(scope, name, body);
    },
    name,
  );
});
