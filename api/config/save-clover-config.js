import { Redis } from "@upstash/redis";
import { getLocationToken } from "../utils/getLocationToken.js";
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

    // Get GHL access token
    const accessToken = await getLocationToken(locationId);

    // 🔥 THIS IS THE KEY PART - Call GHL's Connect Config API
    // This enables test/live mode in the GHL UI
    await updateGHLPaymentConfig(locationId, accessToken, {
      apiKey: apiToken,
      publishableKey: publicKey || merchantId,
      liveMode: liveMode
    });

    console.log("✅ Clover configuration saved and GHL config updated!");

    return res.status(200).json({
      success: true,
      message: "Clover configured successfully! You can now use it for payments.",
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

async function updateGHLPaymentConfig(locationId, accessToken, config) {
  console.log("🔧 Updating GHL payment provider config");
  console.log("   Mode:", config.liveMode ? "LIVE" : "TEST");
  
  // This is the API endpoint from GHL docs that enables test/live mode
  const connectUrl = "https://services.leadconnectorhq.com/payments/custom-provider/connect";
  
  const payload = {
    locationId: locationId,
    liveMode: config.liveMode,
    // These keys enable the payment provider in GHL
    [config.liveMode ? "live" : "test"]: {
      apiKey: config.apiKey,
      publishableKey: config.publishableKey
    }
  };

  console.log("📤 Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(connectUrl, payload, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
      },
    });

    console.log("✅ GHL config updated successfully!");
    console.log("   Response:", JSON.stringify(response.data));
    
  } catch (error) {
    console.error("❌ GHL config update failed:");
    console.error("   Status:", error.response?.status);
    console.error("   Error:", JSON.stringify(error.response?.data));
    
    // Try alternative format if first attempt fails
    if (error.response?.status === 422 || error.response?.status === 400) {
      console.log("   Trying alternative payload format...");
      
      const altPayload = {
        locationId: locationId,
        apiKey: config.apiKey,
        publishableKey: config.publishableKey,
        liveMode: config.liveMode
      };
      
      const altResponse = await axios.post(connectUrl, altPayload, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Version": "2021-07-28",
        },
      });
      
      console.log("✅ Alternative format worked!");
      console.log("   Response:", JSON.stringify(altResponse.data));
    } else {
      throw error;
    }
  }
}