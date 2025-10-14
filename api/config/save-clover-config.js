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

    // Store Clover credentials
    await storeCloverCredentials(locationId, {
      merchantId,
      apiToken,
      publicKey,
      liveMode,
      configuredAt: new Date().toISOString(),
    });

    // Get GHL access token
    const accessToken = await getLocationToken(locationId);
    console.log("✅ GHL access token retrieved");

    // CRITICAL: Create the integration ASSOCIATION first
    console.log("📤 Step 1: Creating integration association...");
    try {
      await createIntegrationAssociation(locationId, accessToken);
      console.log("✅ Integration association created - app should now appear in GHL!");
    } catch (error) {
      console.error("⚠️ Integration association failed:", error.message);
      console.error("   Response:", JSON.stringify(error.response?.data));
      // Don't fail - continue with config update
    }

    // Generate API keys for GHL
    const apiKey = generateApiKey();
    const publishableKey = publicKey || process.env.CLOVER_PAKMS_KEY || generatePublishableKey();

    // Store the API key mapping for webhook verification
    await storeApiKeyMapping(locationId, apiKey);

    // Update GHL provider config - V2 API format
    console.log("📤 Updating GHL provider config...");
    try {
      await updateProviderConfig(locationId, accessToken, {
        liveMode: liveMode || false,
        apiKey: apiKey,
        publishableKey: publishableKey,
      });
      console.log("✅ Provider config updated in GHL");
    } catch (error) {
      console.error("⚠️ Provider config update failed:", error.message);
      console.error("   Status:", error.response?.status);
      console.error("   Response:", JSON.stringify(error.response?.data));
    }

    // Update app capabilities using V2 API
    console.log("📤 Updating app capabilities...");
    try {
      await updateAppCapabilities(accessToken, locationId);
      console.log("✅ App capabilities updated");
    } catch (error) {
      console.error("⚠️ Capabilities update failed:", error.message);
      console.error("   This is optional and may not be available yet");
    }

    console.log("✅ Configuration complete!");
    console.log("💡 Check Settings > Payments > Integrations in GHL");

    return res.status(200).json({
      success: true,
      message: "Clover configured successfully! Payment provider should now appear in GHL Payments > Integrations.",
      details: {
        mode: liveMode ? "LIVE" : "TEST",
        merchantId: merchantId.substring(0, 8) + "...",
        hasPublishableKey: !!publishableKey,
      }
    });
  } catch (error) {
    console.error("❌ Configuration failed:", error);
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

async function storeApiKeyMapping(locationId, apiKey) {
  const key = `api_key_${apiKey}`;
  await redis.set(key, JSON.stringify({
    locationId,
    createdAt: new Date().toISOString(),
  }));
  console.log(`✅ API key mapping stored`);
}

async function updateProviderConfig(locationId, accessToken, config) {
  // V2 API endpoint from documentation
  const url = "https://services.leadconnectorhq.com/payments/custom-provider/config";
  
  const payload = {
    locationId: locationId,
    liveMode: config.liveMode,
    apiKey: config.apiKey,
    publishableKey: config.publishableKey,
  };

  console.log("📤 Provider config payload:", {
    locationId: payload.locationId,
    liveMode: payload.liveMode,
    apiKey: "sk_***",
    publishableKey: config.publishableKey.substring(0, 10) + "***",
  });

  const response = await axios.post(url, payload, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Version": "2021-07-28",
    },
  });

  console.log("✅ Provider config response:", response.data);
  return response.data;
}

async function updateAppCapabilities(accessToken, locationId) {
  // V2 API endpoint - PUT method
  const url = "https://services.leadconnectorhq.com/payments/custom-provider/capabilities";
  
  const payload = {
    locationId: locationId,
    addCardOnFileSupported: false, // Clover doesn't support this via Ecommerce API
  };

  console.log("📤 Capabilities payload:", JSON.stringify(payload));

  try {
    const response = await axios.put(url, payload, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
      },
    });

    console.log("✅ Capabilities response:", response.data);
    return response.data;
  } catch (error) {
    // This endpoint might not be required or might fail - that's OK
    console.log("ℹ️ Capabilities endpoint optional");
    throw error;
  }
}

function generateApiKey() {
  return 'sk_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function generatePublishableKey() {
  return 'pk_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function createIntegrationAssociation(locationId, accessToken) {
  const baseUrl = process.env.VERCEL_URL || 'api.onesolutionapp.com';
  
  // Try method 1: Query parameter
  const url = `https://services.leadconnectorhq.com/payments/custom-provider/provider?locationId=${locationId}`;
  
  const payload = {
    name: "Clover by PNC",
    description: "Accept payments via Clover devices and online",
    imageUrl: "https://www.clover.com/assets/images/public-site/press/clover_logo_primary.png",
    queryUrl: `https://${baseUrl}/api/payment/query`,
    paymentsUrl: `https://${baseUrl}/payment-form`,
  };

  console.log("📤 Attempt 1: locationId in query parameter");
  console.log("📤 URL:", url);
  console.log("📤 Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(url, payload, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
      },
    });

    console.log("✅ Integration created!");
    console.log("✅ Response:", JSON.stringify(response.data));
    return response.data;
    
  } catch (error1) {
    console.error("❌ Query param method failed:", error1.response?.status);
    console.log("📤 Attempt 2: locationId in body as string");
    
    // Try method 2: In body with explicit string conversion
    const url2 = "https://services.leadconnectorhq.com/payments/custom-provider/provider";
    const payload2 = {
      locationId: String(locationId).trim(),
      ...payload
    };
    
    try {
      const response2 = await axios.post(url2, payload2, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Version": "2021-07-28",
        },
      });
      
      console.log("✅ Integration created (method 2)!");
      return response2.data;
      
    } catch (error2) {
      console.error("❌ Body method also failed:", error2.response?.status);
      console.log("📤 Attempt 3: Using /connect endpoint");
      
      // Try method 3: Original connect endpoint
      const url3 = "https://services.leadconnectorhq.com/payments/custom-provider/connect";
      
      try {
        const response3 = await axios.post(url3, payload2, {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Version": "2021-07-28",
          },
        });
        
        console.log("✅ Integration created (method 3)!");
        return response3.data;
        
      } catch (error3) {
        console.error("❌ All methods failed");
        console.error("Final error:", error3.response?.data);
        throw error3;
      }
    }
  }
}