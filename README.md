# Clover ↔ GoHighLevel integration
This project contains the full serverless + static bundle that powers the Clover custom payment provider for GoHighLevel (GHL). The intent is to drop the folder into a Vercel project, configure the environment variables, and deploy. The repo already reflects the consolidation needed to stay under the 11-function limit on the current Vercel plan.

## High-level architecture

- **OAuth flow** – `/api/oauth/[step].js` performs the V2 OAuth exchange, stores tokens in Upstash Redis, and then redirects installers to a static bridge at `/oauth/redirect.html` so the GHL iframe can break out to the hosted setup UI.
- **Hosted management UI** – `/public/integration/index.html` loads configuration details from `/api/setup`, saves Clover keys through `/api/config/save-clover-config`, and links out to the hosted payment form rendered by `/api/payment/form-simple`.
- **Payments** – `/api/payment/[action].js` handles the hosted payment form render and payment processing, delegating to `lib/clover/createCharge.js` for Clover Ecommerce transactions and `lib/ghl/payments.js` for V2 invoice syncing.
- **Device swipes & webhooks** – `/api/invoice/track.js` stores invoice/location mappings before a customer pays, while `/api/webhooks/clover.js` consumes Clover webhook payloads, matches them back to tracked invoices, and records the payment against the correct GHL invoice.
- **Diagnostics** – `/api/test/[action].js` provides token, credential, and provider-registration checks to debug installations without adding extra serverless functions.

The [Vercel rewrites](./vercel.json) map the public routes (`/oauth/redirect`, `/integration`, `/pay/clover`, etc.) to their corresponding static assets or consolidated handlers so the entire experience fits within the Vercel limit.

## Required environment variables

Set these in Vercel (or your local `.env`) before deploying:

| Variable | Purpose |
| --- | --- |
| `APP_BASE_URL` or `PUBLIC_APP_URL` | Absolute origin for redirect URLs used after OAuth. |
| `GHL_CLIENT_ID` / `GHL_CLIENT_SECRET` | OAuth credentials for the GHL marketplace app. |
| `OAUTH_REDIRECT_URI` | Must exactly match the redirect URI registered with GHL. |
| `storage_KV_REST_API_URL` / `storage_KV_REST_API_TOKEN` | Upstash Redis credentials for storing tokens and mappings. |
| `CLOVER_API_TOKEN` | Clover Ecommerce private token used for API calls. |
| `CLOVER_PAKMS_KEY` | Public token used by the hosted payment form. |
| `CLOVER_ENVIRONMENT` | `production` or `sandbox` to pick the correct Clover endpoints. |
| `ADMIN_SECRET` | Shared secret for the force uninstall admin endpoint (optional). |

## Device payment workflow

When taking a payment on a Clover terminal, have the agent type the GoHighLevel invoice number into the payment's **Note** field (for example `INV-1234`). The webhook reads that note, normalizes the invoice reference, and looks up the previously tracked invoice/location mapping so it can automatically record the payment back to the correct GoHighLevel invoice. If the note is missing, the webhook falls back to recent amount matches using the pending invoice cache stored in Redis.

## Installation & manual configuration steps

1. Install the app from GoHighLevel and approve the OAuth prompt.
2. After authorization completes the installer is redirected to `/oauth/redirect.html`, which breaks out of the GHL iframe and forwards the user to the public integration page.
3. Finish setup on `/integration/`. The form loads the location's existing Clover credentials via `/api/setup`, masks sensitive fields, and stores any updates through `/api/config/save-clover-config` so device swipes, hosted payments, and invoice syncs can use the saved merchant keys.
4. (Optional) Use `/api/test/diagnostics?locationId=...` to confirm tokens are present and the Clover credentials are configured.

## Static assets & hosted form

- `/oauth/redirect.html` – Static bridge that safely breaks the iframe and forwards installers to `/integration/` with their `locationId` and `companyId` query parameters intact.
- `/integration/index.html` – Public management page for viewing and updating Clover credentials, linking to the hosted form, and confirming installation status.
- `/api/payment/form-simple` – Renders the hosted payment page using the sanitized template in `lib/templates/paymentForm.js`. The page posts back to `/api/payment/process`, which charges the card via Clover and calls `recordPaymentOrder` to update the related invoice in GHL.

With these pieces deployed and the environment variables populated, the app can complete the OAuth handshake, capture hosted or terminal payments via Clover, and sync everything back to the matching GHL invoices.
