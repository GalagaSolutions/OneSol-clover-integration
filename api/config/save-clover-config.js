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
      });
    }

    console.log("💾 Saving Clover configuration for location:", locationId);
    console.log("   Mode:", liveMode ? "LIVE" : "TEST");

    // Store Clover credentials in Redis
    await storeCloverCredentials(locationId, {
      merchantId,
      apiToken,
      publicKey,
      liveMode,
      configuredAt: new Date().toISOString(),
    });

    // Get the GHL access token
    let accessToken;
    try {
      accessToken = await getLocationToken(locationId);
      console.log("✅ GHL access token verified for location:", locationId);
    } catch (error) {
      console.log("⚠️ Could not verify GHL token:", error.message);
      return res.status(200).json({
        success: true,
        providerConfigured: false,
        message: "Clover configuration saved, but OAuth may need to be completed first.",
        warning: "Complete app installation to enable full integration.",
      });
    }

    // Try to register/update the payment provider now that we have Clover config
    let providerConfigured = false;
    try {
      providerConfigured = await registerPaymentProvider(locationId, accessToken, liveMode);
      if (providerConfigured) {
        console.log("✅ Payment provider registration completed");
      } else {
        console.log("⚠️ Payment provider registration skipped - missing OAuth keys");
      }
    } catch (error) {
      console.error("⚠️ Payment provider registration failed:", error.message);
      return res.status(200).json({
        success: true,
        providerConfigured: false,
        message: "Clover credentials saved, but provider configuration is incomplete.",
        warning: "Open the app install flow again, then retry Save Configuration.",
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
    });
  } catch (error) {
    console.error("❌ Failed to save Clover config:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to save configuration",
    });
  }
}

async function storeCloverCredentials(locationId, credentials) {
  const key = `clover_config_${locationId}`;
  await redis.set(key, JSON.stringify(credentials));
  console.log(`✅ Clover credentials stored for location: ${locationId}`);
}

async function registerPaymentProvider(locationId, accessToken, liveMode) {
  console.log("📤 Attempting payment provider registration via config save");
  
  // Get the API keys that were generated during OAuth
  const keysData = await redis.get(`clover_keys_${locationId}`);
  if (!keysData) {
    console.log("⚠️ No API keys found - OAuth may not have completed");
    return false;
  }
  
  const keys = JSON.parse(keysData);
  
  // Try to set the provider configuration
  const configUrl = "https://services.leadconnectorhq.com/payments/custom-provider/config";
  
  const configPayload = {
    locationId: locationId,
    liveMode: !!liveMode,
    apiKey: keys.apiKey,
    publishableKey: keys.publishableKey
  };

  console.log("🔧 Setting provider configuration");
  console.log("   Config payload:", JSON.stringify(configPayload, null, 2));

  try {
    const configResponse = await axios.post(configUrl, configPayload, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
      },
    });

    console.log("✅ Provider configuration updated!");
    console.log("   Response:", JSON.stringify(configResponse.data));
    return true;
    
  } catch (error) {
    console.error("❌ Provider configuration failed");
    console.error("   Status:", error.response?.status);
    console.error("   Error:", JSON.stringify(error.response?.data));
    
    // Try alternative approach - just ensure the integration status is marked
    await redis.set(`integration_status_${locationId}`, JSON.stringify({
      status: "clover_configured",
      timestamp: Date.now(),
      hasApiKeys: true,
      hasTokens: true,
      hasCloverConfig: true,
      needsManualSetup: true
    }));
    
    throw error;
  }
}
