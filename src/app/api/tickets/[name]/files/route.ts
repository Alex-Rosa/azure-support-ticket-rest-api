import type { NextRequest } from "next/server";
import { ArmError, planChunks, sanitizeFileName, type Scope, type SupportClient } from "@/lib/azure-support";
import { guardedWrite, handle, scopeFrom } from "@/lib/server/handler";
import { getSupportClient } from "@/lib/server/support";

type Ctx = RouteContext<"/api/tickets/[name]/files">;

/** An existing ticket's file workspace is named after its support ticket number. */
async function workspaceFor(client: SupportClient, scope: Scope, ticketName: string): Promise<string> {
  const ticket = await client.getTicket(scope, ticketName);
  const workspace = ticket.properties.supportTicketId;
  if (!workspace) throw new ArmError(409, "NoTicketNumber", "This ticket has no support ticket number yet; try again shortly.");
  return workspace;
}

export const GET = handle(async (req: NextRequest, ctx: Ctx) => {
  const { name } = await ctx.params;
  const scope = scopeFrom(req);
  const client = getSupportClient(req);
  const workspace = await workspaceFor(client, scope, name);
  const files = await client.listFiles(scope, workspace).catch((err) => {
    // A ticket that never had attachments may have no workspace yet.
    if (err instanceof ArmError && err.status === 404) return [];
    throw err;
  });
  return Response.json({ workspace, files });
});

/** multipart/form-data: one or more `file` fields, and `confirm` ("true" to send). */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const { name } = await ctx.params;
  const scope = scopeFrom(req);
  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new ArmError(400, "FileRequired", "Attach at least one file in the `file` field.");
  for (const file of files) planChunks(file.size); // Validates sizes before any Azure call.
  const names = files.map((f) => sanitizeFileName(f.name));
  if (new Set(names).size !== names.length) throw new ArmError(400, "DuplicateFileName", "Two files have the same name.");

  const client = getSupportClient(req);
  const workspace = await workspaceFor(client, scope, name);

  return guardedWrite(
    form.get("confirm") === "true",
    () => files.flatMap((file, i) => client.planUploadFile(scope, workspace, names[i], file.size)),
    async () => {
      const uploaded = [];
      for (const [i, file] of files.entries()) {
        uploaded.push(await client.uploadFile(scope, workspace, names[i], new Uint8Array(await file.arrayBuffer())));
      }
      return uploaded;
    },
  );
});
