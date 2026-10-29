# Azure Support Ticket Manager

A local web app for creating and managing Azure support tickets through the [Azure Support REST API](https://learn.microsoft.com/rest/api/support/?view=rest-support-2024-04-01) (`Microsoft.Support`, `2024-04-01`).

- **List and filter tickets** for a subscription or at tenant level, by status, created date, service and severity, with paging.
- **Ticket detail**: description, SLA, contact, support engineer, messages, chat transcripts.
- **Create tickets** in a guided flow: service → problem type (with optional AI suggestions from the preview classify API) → details → contact → review.
- **Update and reply**: change severity, status, diagnostic consent or contact details, and add messages.
- **Safe by default**: every write is a dry run that shows the exact request. Real calls need `SUPPORT_LIVE_MODE=true` *and* a confirm click.
- **Three auth modes**: Azure CLI, service principal, or Entra ID user sign-in.

## Quick start

```bash
az login
npm install
npm run dev
```

Open http://localhost:3000. With no `.env.local`, the app uses your Azure CLI login in dry-run mode. For the other auth modes, RBAC and going live, see [docs/SETUP.md](docs/SETUP.md).

## How it works

```
Browser (React client components)
   │  fetch /api/*  (no Azure tokens in the browser)
   ▼
Next.js route handlers  ── src/app/api/**
   │  auth: AzureCliCredential | ClientSecret/CertificateCredential | MSAL user session
   │  guard: dry run unless SUPPORT_LIVE_MODE=true and confirm: true
   ▼
SupportClient / ArmClient  ── src/lib/azure-support/**
   │  api-version, error mapping, nextLink paging, long-running operation polling
   ▼
https://management.azure.com/…/providers/Microsoft.Support/…
```

| Area | Operation groups used |
| --- | --- |
| Catalog | Services, Problem Classifications, classifyProblems (`2025-06-01-preview`) |
| Tickets | Support Tickets, Support Tickets No Subscription (list, get, create, update, check name) |
| Messages | Communications, Communications No Subscription (list, create, check name) |
| Chats | Chat Transcripts, Chat Transcripts No Subscription (list) |

The scope picker in the header switches between a subscription (`/subscriptions/{id}/providers/Microsoft.Support/…`) and the tenant-level "No Subscription" endpoints (`/providers/Microsoft.Support/…`). A ticket can only be read from the scope it was created in.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app on http://localhost:3000 |
| `npm test` | Unit tests (Vitest) against mocked ARM responses; they never call Azure |
| `npm run typecheck` | Generate Next.js route types and run `tsc` |
| `npm run lint` | ESLint |

## Not in v1

- File attachments (File Workspaces / Files APIs)
- Hosting and multi-user deployment
- Severity can't be filtered server-side (the API only supports status, created date, service and problem classification), so the severity filter applies to loaded pages only.
