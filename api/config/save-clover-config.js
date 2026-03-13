import { Redis } from "@upstash/redis";
import { getLocationToken } from "../../lib/getLocationToken.js";
import axios from "axios";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { locationId, merchantId, apiToken, publicKey, liveMode } = req.body;

    if (!locationId || !merchantId || !apiToken) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: locationId, merchantId, or apiToken",
        diagnostics: {
          stage: "input_validation",
          received: {
            hasLocationId: !!locationId,
            hasMerchantId: !!merchantId,
            hasApiToken: !!apiToken,
            hasPublicKey: !!publicKey,
            liveMode: !!liveMode,
          },
        },
      });
    }

    if (!process.env.storage_KV_REST_API_URL || !process.env.storage_KV_REST_API_TOKEN) {
      return res.status(500).json({
        success: false,
        error: "Redis environment variables are missing.",
        diagnostics: {
          stage: "redis_env_validation",
          hasRedisUrl: !!process.env.storage_KV_REST_API_URL,
          hasRedisToken: !!process.env.storage_KV_REST_API_TOKEN,
          hint: "Set storage_KV_REST_API_URL and storage_KV_REST_API_TOKEN in Vercel and redeploy.",
        },
      });
    }

    console.log("💾 Saving Clover configuration for location:", locationId);
    console.log("   Mode:", liveMode ? "LIVE" : "TEST");

    await storeCloverCredentials(locationId, {
      merchantId,
      apiToken,
      publicKey,
      liveMode,
      configuredAt: new Date().toISOString(),
    });

    let accessToken;
    try {
      accessToken = await getLocationToken(locationId);
      console.log("✅ GHL access token verified for location:", locationId);
    } catch (error) {
      const diagnostics = buildDiagnostics(error, "ghl_token_lookup", { locationId });
      console.log("⚠️ Could not verify GHL token:", diagnostics.message);
      return res.status(200).json({
        success: true,
        providerConfigured: false,
        message: "Clover configuration saved, but OAuth may need to be completed first.",
        warning: "Complete app installation to enable full integration.",
        diagnostics,
      });
    }

    let providerConfigured = false;
    try {
      providerConfigured = await registerPaymentProvider(locationId, accessToken, liveMode);
      if (providerConfigured) {
        console.log("✅ Payment provider registration completed");
      } else {
        console.log("⚠️ Payment provider registration skipped - missing OAuth keys");
      }
    } catch (error) {
      const diagnostics = buildDiagnostics(error, "provider_config", {
        locationId,
        liveMode: !!liveMode,
      });
      console.error("⚠️ Payment provider registration failed:", diagnostics.message);
      return res.status(200).json({
        success: true,
        providerConfigured: false,
        message: "Clover credentials saved, but provider configuration is incomplete.",
        warning: "Open the app install flow again, then retry Save Configuration.",
        diagnostics,
      });
    }

    console.log("✅ Clover configuration saved successfully");

    return res.status(200).json({
      success: true,
      providerConfigured,
      message: providerConfigured
        ? "Clover configuration saved successfully! Check Settings > Payments > Integrations in GHL."
        : "Clover credentials saved, but provider configuration is waiting on OAuth keys.",
      warning: providerConfigured
        ? undefined
        : "Complete app installation and retry Save Configuration to finish setup.",
      diagnostics: {
        stage: "completed",
        locationId,
        liveMode: !!liveMode,
      },
    });
  } catch (error) {
    const diagnostics = buildDiagnostics(error, error.stage || "save_clover_config", {
      locationId: req.body?.locationId || null,
      liveMode: !!req.body?.liveMode,
    });

    console.error("❌ Failed to save Clover config:", diagnostics);
    return res.status(500).json({
      success: false,
      error: diagnostics.message || "Failed to save configuration",
      diagnostics,
    });
  }
}

async function storeCloverCredentials(locationId, credentials) {
  const key = `clover_config_${locationId}`;

  try {
    await redis.set(key, JSON.stringify(credentials));
    console.log(`✅ Clover credentials stored for location: ${locationId}`);
  } catch (error) {
    throw withStage(error, "redis_write_config", {
      key,
      locationId,
      hint: "Redis write failed. Verify Upstash URL/token and network access.",
    });
  }
}

async function registerPaymentProvider(locationId, accessToken, liveMode) {
  console.log("📤 Attempting payment provider registration via config save");
  
  let keysData;
  try {
    keysData = await redis.get(`clover_keys_${locationId}`);
  } catch (error) {
    throw withStage(error, "redis_read_oauth_keys", {
      key: `clover_keys_${locationId}`,
      locationId,
      hint: "Could not read Clover OAuth keys from Redis.",
    });
  }

  if (!keysData) {
    console.log("⚠️ No API keys found - OAuth may not have completed");
    return false;
  }

  let keys;
  try {
    keys = typeof keysData === "string" ? JSON.parse(keysData) : keysData;

    if (!keys || typeof keys !== "object") {
      throw new Error("Stored Clover OAuth key payload is not an object");
    }
  } catch (error) {
    throw withStage(error, "redis_parse_oauth_keys", {
      locationId,
      valueType: typeof keysData,
      hint: "Stored Clover OAuth key payload is not valid JSON/object.",
    });
  }

  const configUrl = "https://services.leadconnectorhq.com/payments/custom-provider/config";
  
  const configPayload = {
    locationId,
    liveMode: !!liveMode,
    apiKey: keys.apiKey,
    publishableKey: keys.publishableKey,
  };

  console.log("🔧 Setting provider configuration");
  console.log("   Config payload:", JSON.stringify(configPayload, null, 2));

  try {
    const configResponse = await axios.post(configUrl, configPayload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
    });

    console.log("✅ Provider configuration updated!");
    console.log("   Response:", JSON.stringify(configResponse.data));
    return true;
  } catch (error) {
    console.error("❌ Provider configuration failed");
    console.error("   Status:", error.response?.status);
    console.error("   Error:", JSON.stringify(error.response?.data));

    try {
      await redis.set(
        `integration_status_${locationId}`,
        JSON.stringify({
          status: "clover_configured",
          timestamp: Date.now(),
          hasApiKeys: true,
          hasTokens: true,
          hasCloverConfig: true,
          needsManualSetup: true,
        })
      );
    } catch (statusWriteError) {
      console.error("⚠️ Failed to write integration_status_ marker:", statusWriteError.message);
    }

    throw withStage(error, "provider_config_api", {
      locationId,
      liveMode: !!liveMode,
      status: error.response?.status,
      responseData: error.response?.data,
      hint: "LeadConnector provider config API call failed.",
    });
  }
}

function withStage(error, stage, extra = {}) {
  const wrapped = new Error(error?.message || "Unknown error");
  wrapped.name = error?.name || "Error";
  wrapped.stack = error?.stack || wrapped.stack;
  wrapped.stage = stage;
  wrapped.code = error?.code;
  wrapped.status = error?.response?.status || extra.status;
  wrapped.responseData = error?.response?.data || extra.responseData;
  wrapped.hint = extra.hint;
  wrapped.extra = extra;
  return wrapped;
}

function buildDiagnostics(error, stage, extra = {}) {
  return {
    stage,
    message: error?.message || "Unknown error",
    name: error?.name || "Error",
    code: error?.code || null,
    status: error?.status || error?.response?.status || null,
    responseData: error?.responseData || error?.response?.data || null,
    hint: error?.hint || extra.hint || hintForStage(stage),
    isAxiosError: !!error?.isAxiosError,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

function hintForStage(stage) {
  if (stage === "redis_env_validation" || stage.startsWith("redis_")) {
    return "Verify Redis env vars in Vercel and confirm the Upstash DB is active/reachable.";
  }

  if (stage.startsWith("ghl_")) {
    return "Reinstall or re-auth the app in GHL to refresh location tokens.";
  }

  if (stage.startsWith("provider_")) {
    return "Verify GHL custom provider API access, OAuth scopes, and stored API keys.";
  }

  return "Check Vercel function logs for full stack trace and retry.";
}
