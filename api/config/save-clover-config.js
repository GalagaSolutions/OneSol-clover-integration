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

    // Verify we can get the GHL access token (validates OAuth worked)
    try {
      await getLocationToken(locationId);
      console.log("✅ GHL access token verified for location:", locationId);
    } catch (error) {
      console.log("⚠️ Could not verify GHL token:", error.message);
    }

    console.log("✅ Clover configuration saved successfully");
    console.log("💡 Integration should now be ready for payments");

    return res.status(200).json({
      success: true,
      message: "Clover configuration saved successfully.",
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