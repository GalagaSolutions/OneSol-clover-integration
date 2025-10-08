import axios from "axios";
import { Redis } from "@upstash/redis";
import { getLocationToken } from "../utils/getLocationToken.js";

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

    // Validate required fields
    if (!locationId || !merchantId || !apiToken) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: locationId, merchantId, or apiToken",
      });
    }

    console.log("💾 Saving Clover configuration for location:", locationId);
    console.log("   Mode:", liveMode ? "LIVE" : "TEST");

    // Store Clover credentials
    await storeCloverCredentials(locationId, {
      merchantId,
      apiToken,
      publicKey,
      liveMode,
      configuredAt: new Date().toISOString(),
    });

    // Get GHL access token for this location
    const accessToken = await getLocationToken(locationId);

    // Register payment provider config with GHL
    await registerPaymentConfig(locationId, accessToken, {
      apiKey: apiToken, // Used for backend verification
      publishableKey: publicKey || merchantId, // Used for frontend
      liveMode,
    });

    console.log("✅ Clover configuration saved and registered with GHL");

    return res.status(200).json({
      success: true,
      message: "Clover configuration saved successfully",
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

async function registerPaymentConfig(locationId, accessToken, config) {
  // This is the correct API endpoint for registering payment provider config
  const configUrl =
    "https://services.leadconnectorhq.com/payments/custom-provider/config";

  const payload = {
    locationId: locationId,
    apiKey: config.apiKey,
    publishableKey: config.publishableKey,
    liveMode: config.liveMode,
  };

  console.log("📤 Registering payment config with GHL");
  console.log("   Payload:", JSON.stringify(payload));

  try {
    const response = await axios.post(configUrl, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
    });

    console.log("✅ Payment config registered:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Payment config registration failed:");
    console.error("   Status:", error.response?.status);
    console.error("   Error:", error.response?.data);
    throw new Error(
      error.response?.data?.message || "Failed to register payment config"
    );
  }
}