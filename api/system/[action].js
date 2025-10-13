// api/system/[action].js
import { getLocationTokens } from "../utils/tokenStorage";
import { verifyCloverCredentials } from "../utils/cloverConfig";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { action } = req.query;

  switch (action) {
    case 'diagnostics':
      return handleDiagnostics(req, res);
    case 'connection-test':
      return handleConnectionTest(req, res);
    case 'register':
      return handleProviderRegistration(req, res);
    case 'uninstall':
      return handleForceUninstall(req, res);
    default:
      return res.status(404).json({ error: 'Action not found' });
  }
}

// Handlers moved from:
// - test/diagnostics.js
// - test/clover-connection.js
// - test/register-provider.js
// - admin/force-uninstall.js