// api/auth/[action].js
import { getLocationTokens, storeLocationTokens } from "../utils/tokenStorage";
import { verifyCloverCredentials } from "../utils/cloverConfig";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { action } = req.query;

  switch (action) {
    case 'callback':
      return handleOAuthCallback(req, res);
    case 'setup':
      return handleSetup(req, res);
    case 'save-config':
      return handleSaveConfig(req, res);
    default:
      return res.status(404).json({ error: 'Action not found' });
  }
}

// Handlers moved from:
// - oauth/callback.js
// - setup.js
// - config/save-clover-config.js