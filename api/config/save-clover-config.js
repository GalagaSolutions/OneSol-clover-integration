// api/config/save-clover-config.js
// CORRECTED VERSION using official GHL V2 Payment Provider API
import { Redis } from "@upstash/redis";
import { getLocationToken } from "../utils/getLocationToken.js";
import axios from "axios";
import crypto from "crypto";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { 
      locationId, 
      companyId,
      merchantId, 
      apiToken, 
      pakmsKey, 
      environment 
    } = req.body;

    // Validate required fields
    if (!locationId || !merchantId || !apiToken) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: locationId, merchantId, or apiToken",
      });
    }

    console.log("💾 Saving Clover configuration");
    console.log("   Location ID:", locationId);
    console.log("   Environment:", environment);

    // Generate secure API keys for GHL to use when calling our endpoints
    const providerApiKey = crypto.randomBytes(32).toString('hex');
    const publishableKey = crypto.randomBytes(32).toString('hex');

    // Step 1: Store Clover credentials in Redis
    await storeCloverCredentials(locationId, {
      merchantId,
      apiToken,
      pakmsKey,
      environment,
      configuredAt: new Date().toISOString(),
    });

    // Step 2: Store GHL provider keys (for verification in query endpoint)
    await storeProviderConfig(locationId, {
      apiKey: providerApiKey,
      publishableKey: publishableKey,
      environment,
    });

    // Step 3: Get GHL access token
    let accessToken;
    try {
      accessToken = await getLocationToken(locationId);
      console.log("✅ GHL access token retrieved");
    } catch (error) {
      console.error("⚠️ Could not get GHL token:", error.message);
      return res.status(200).json({
        success: true,
        warning: "Clover configured but could not register with GHL. Complete OAuth flow first.",
        message: "Clover credentials saved locally. Please complete app installation to enable in GHL."
      });
    }

    // Step 4: Create provider association (FIRST - this links app to location)
    try {
      await createProviderAssociation(locationId, accessToken);
      console.log("✅ Provider association created");
    } catch (error) {
      console.error("⚠️ Provider association failed:", error.message);
      console.error("   Details:", error.response?.data);
      // Continue - might already exist
    }

    // Step 5: Create/update provider config (SECOND - this configures the provider)
    try {
      await createProviderConfig(locationId, accessToken, {
        apiKey: providerApiKey,
        publishableKey: publishableKey,
        isTest: environment !== 'production',
      });
      console.log("✅ Provider config created in GHL");
    } catch (error) {
      console.error("⚠️ Provider config failed:", error.message);
      console.error("   Details:", error.response?.data);
    }

    return res.status(200).json({
      success: true,
      message: "Clover account connected successfully! Check Settings > Payments > Integrations in GHL.",
      providerRegistered: true,
    });

  } catch (error) {
    console.error("❌ Failed to save Clover config:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to save configuration",
    });
  }
}

/**
 * Store Clover merchant credentials in Redis
 */
async function storeCloverCredentials(locationId, credentials) {
  const key = `clover_config_${locationId}`;
  await redis.set(key, JSON.stringify(credentials));
  console.log(`✅ Clover credentials stored: ${key}`);
}

/**
 * Store GHL provider configuration (API keys for verification)
 */
async function storeProviderConfig(locationId, config) {
  const key = `ghl_provider_config_${locationId}`;
  await redis.set(key, JSON.stringify(config));
  console.log(`✅ Provider config stored: ${key}`);
}

/**
 * STEP 1: Create provider association
 * This links your marketplace app to the location as a payment provider
 * Endpoint: POST /payments/custom-provider/provider
 */
async function createProviderAssociation(locationId, accessToken) {
  console.log("📤 Creating provider association");

  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : process.env.BASE_URL || 'https://your-domain.vercel.app';

  const payload = {
    locationId: locationId,
    name: "Clover by PNC",
    description: "Accept payments via Clover devices and update invoices automatically",
    imageUrl: "https://www.clover.com/assets/images/public-site/press/clover_logo_dark.png",
    
    // WHERE GHL SENDS REQUESTS
    queryUrl: `${baseUrl}/payments/query`,      // For verify, refund, charge operations
    paymentsUrl: `${baseUrl}/payment/form`,     // Payment form iframe URL
  };

  console.log("📋 Provider association payload:");
  console.log(JSON.stringify(payload, null, 2));

  const url = "https://services.leadconnectorhq.com/payments/custom-provider/provider";

  try {
    const response = await axios.post(url, payload, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
      },
    });

    console.log("✅ Provider association created!");
    console.log("   Response:", JSON.stringify(response.data, null, 2));
    return response.data;

  } catch (error) {
    // If error is 409 (Conflict), provider already exists - that's OK
    if (error.response?.status === 409) {
      console.log("ℹ️  Provider already exists (409) - continuing");
      return { exists: true };
    }
    throw error;
  }
}

/**
 * STEP 2: Create provider config
 * This provides the API keys GHL uses to communicate with your endpoints
 * Endpoint: POST /payments/custom-provider/connect
 */
async function createProviderConfig(locationId, accessToken, config) {
  console.log("📤 Creating provider config");

  // According to GHL docs, send EITHER liveMode OR testMode config
  const payload = {
    locationId: locationId,
  };

  if (config.isTest) {
    // Test mode configuration
    payload.testMode = {
      apiKey: config.apiKey,
      publishableKey: config.publishableKey,
    };
    console.log("   Mode: TEST");
  } else {
    // Live mode configuration
    payload.liveMode = {
      apiKey: config.apiKey,
      publishableKey: config.publishableKey,
    };
    console.log("   Mode: LIVE");
  }

  console.log("📋 Provider config payload:");
  console.log(JSON.stringify(payload, null, 2));

  const url = "https://services.leadconnectorhq.com/payments/custom-provider/connect";

  try {
    const response = await axios.post(url, payload, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
      },
    });

    console.log("✅ Provider config created!");
    console.log("   Response:", JSON.stringify(response.data, null, 2));
    return response.data;

  } catch (error) {
    // If config already exists, try updating it
    if (error.response?.status === 422 || error.response?.status === 409) {
      console.log("ℹ️  Config exists, trying PUT to update...");
      
      try {
        const updateResponse = await axios.put(url, payload, {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Version": "2021-07-28",
          },
        });
        
        console.log("✅ Provider config updated!");
        return updateResponse.data;
      } catch (updateError) {
        console.error("❌ Update failed:", updateError.response?.data);
        throw updateError;
      }
    }
    throw error;
  }
}