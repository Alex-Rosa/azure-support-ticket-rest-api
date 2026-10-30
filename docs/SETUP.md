# Setup

This app runs locally and calls the [Azure Support REST API](https://learn.microsoft.com/rest/api/support/?view=rest-support-2024-04-01) (`Microsoft.Support`, API version `2024-04-01`) with one of three identities. Pick one auth mode below and put its settings in `.env.local` (start from `.env.example`).

## Prerequisites

- Node.js 20 or newer
- Azure CLI (`az`) for the default auth mode and for the setup commands below
- An Azure support plan: technical tickets need a paid plan (Developer, Standard, Professional Direct, Unified or Premier). Billing, subscription-management and quota tickets work on any plan.

## Permissions (RBAC)

Whichever identity the app uses needs permission to read and write support tickets on each subscription you select in the app. The built-in **Support Request Contributor** role grants it (Owner and Contributor do too).

Without it, the ticket list shows `403 Forbidden … Learn about RBAC for support ticket operations`. To grant the role:

```bash
az role assignment create \
  --assignee "<user UPN or app ID>" \
  --role "Support Request Contributor" \
  --scope "/subscriptions/<subscription-id>"
```

Tenant-level tickets (the **Tenant (no subscription)** scope, which uses the "No Subscription" operation groups) cover billing and subscription-management issues. Access to them depends on your tenant and billing role. See [Azure Support API RBAC](https://aka.ms/supportapi).

## Auth mode 1: Azure CLI (default)

```bash
az login
az account show
```

With `AUTH_MODE=cli` (or no `.env.local` at all), the server uses your CLI session. Nothing else is needed.

## Auth mode 2: service principal

Create an app identity that holds the role on one subscription:

```bash
az ad sp create-for-rbac \
  --name "azure-support-ticket-manager" \
  --role "Support Request Contributor" \
  --scopes "/subscriptions/<subscription-id>"
```

Copy `tenant`, `appId` and `password` from the output into `.env.local`:

```ini
AUTH_MODE=service-principal
AZURE_TENANT_ID=<tenant>
AZURE_CLIENT_ID=<appId>
AZURE_CLIENT_SECRET=<password>
```

To use a certificate instead of a secret, set `AZURE_CLIENT_CERTIFICATE_PATH` to a PEM file that contains the private key and certificate, and leave out the secret.

> When a service principal adds a message to a ticket, the API requires a `sender` email. The app sends the ticket's primary contact email.

## Auth mode 3: user sign-in (Entra ID)

Each user signs in with their own Microsoft account, and the app calls Azure with that user's permissions (delegated `user_impersonation`). This needs an app registration in your tenant.

1. Create the registration with the local redirect URI:

   ```bash
   APP_ID=$(az ad app create \
     --display-name "Azure Support Ticket Manager (local)" \
     --sign-in-audience AzureADMyOrg \
     --web-redirect-uris "http://localhost:3000/api/auth/callback" \
     --query appId -o tsv)
   echo "$APP_ID"
   ```

2. Add the delegated **Azure Resource Manager → user_impersonation** permission (older tenants list the API as *Azure Service Management*) and grant consent:

   ```bash
   # 797f4846-… is Azure Resource Manager; 41094075-… is its user_impersonation scope.
   az ad app permission add --id "$APP_ID" \
     --api 797f4846-ba00-4fd7-ba43-dac1f8f63013 \
     --api-permissions 41094075-9dad-400e-a0bd-54e686782033=Scope
   az ad sp create --id "$APP_ID"
   az ad app permission admin-consent --id "$APP_ID"   # needs an admin; otherwise each user consents at sign-in
   ```

   In the portal this is: App registrations → your app → API permissions → Add → Azure Resource Manager (or Azure Service Management) → Delegated → `user_impersonation`.

3. Create a client secret:

   ```bash
   az ad app credential reset --id "$APP_ID" --display-name local-dev --years 1 --query password -o tsv
   ```

4. Configure `.env.local`:

   ```ini
   AUTH_MODE=user
   AZURE_AD_TENANT_ID=<your tenant ID, or "organizations">
   AZURE_AD_CLIENT_ID=<APP_ID>
   AZURE_AD_CLIENT_SECRET=<secret from step 3>
   APP_BASE_URL=http://localhost:3000
   ```

Until `AZURE_AD_CLIENT_ID` and `AZURE_AD_CLIENT_SECRET` are set, `AUTH_MODE=user` falls back to Azure CLI auth and the app shows a warning.

Sessions and the MSAL token cache live in server memory, so restarting `npm run dev` signs you out. That's fine for local use; a hosted deployment would need a persistent session and token store.

## Going live

By default every write is a **dry run**. The app shows the exact `PUT`/`PATCH` it would send, and Azure is never called. To send real requests:

```ini
SUPPORT_LIVE_MODE=true
```

The header badge then reads **LIVE**. Each create, reply or update still shows the request first and only sends it after you click **Send to Azure**. A created ticket is a real case with Microsoft Support. There is no sandbox, so close test tickets right away from **Manage → Status: Closed**.

## Troubleshooting

**Intermittent `403 Forbidden … Learn about RBAC for support ticket operations`.** On some subscriptions, the Support resource provider rejects a share of subscription-scope calls even when the caller has access. We saw about 60% of calls rejected with the same token, while tenant-scope calls always succeeded. To check whether you're seeing this rather than a missing role, call the API a few times in a row. Mixed 200/403 results with the same token mean it's the intermittent issue.

The app retries reads (and the read-only name checks) up to four times with backoff, which hides nearly all of these. Writes are never retried automatically; if one fails this way, the message says so and you can submit it again. A persistent 403 on every call is a real permissions problem; see [Permissions](#permissions-rbac).
