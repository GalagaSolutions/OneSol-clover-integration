// api/core/[action].js
import { getLocationTokens, storeLocationTokens } from "../utils/tokenStorage.js";
import { verifyCloverCredentials, getCloverConfig } from "../utils/cloverConfig.js";
import axios from "axios";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { action } = req.query;

  // Auth actions
  if (['callback', 'setup', 'save-config'].includes(action)) {
    return handleAuthAction(action, req, res);
  }

  // System actions
  if (['diagnostics', 'connection-test', 'register', 'uninstall'].includes(action)) {
    return handleSystemAction(action, req, res);
  }

  // Configuration actions
  if (['verify', 'setup-merchant'].includes(action)) {
    return handleConfigAction(action, req, res);
  }

  return res.status(404).json({ error: 'Action not found' });
}

async function handleAuthAction(action, req, res) {
  switch (action) {
    case 'callback':
      return handleOAuthCallback(req, res);
    case 'setup':
      return handleSetup(req, res);
    case 'save-config':
      return handleSaveConfig(req, res);
    default:
      return res.status(404).json({ error: 'Invalid auth action' });
  }
}

async function handleSystemAction(action, req, res) {
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
      return res.status(404).json({ error: 'Invalid system action' });
  }
}

async function handleConfigAction(action, req, res) {
  switch (action) {
    case 'verify':
      return handleVerifyConfig(req, res);
    case 'setup-merchant':
      return handleMerchantSetup(req, res);
    default:
      return res.status(404).json({ error: 'Invalid config action' });
  }
}