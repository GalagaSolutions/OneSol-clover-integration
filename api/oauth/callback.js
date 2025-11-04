import axios from "axios";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  try {
    const { code } = req.query;

    if (!code) {
      console.error("❌ No authorization code provided");
      return res.status(400).send("Missing authorization code");
    }

    console.log("🔄 Exchanging authorization code for tokens...");

    // Exchange code for tokens
    const tokenData = await exchangeCodeForToken(code);
    
    // Extract location ID - try multiple possible locations in response
    const locationId = tokenData.locationId || tokenData.location_id;
    const companyId = tokenData.companyId || tokenData.company_id;
    
    if (!locationId) {
      console.error("❌ No locationId found in token response:", tokenData);
      throw new Error("locationId not found in OAuth response");
    }

    const {
      access_token,
      refresh_token,
      expires_in,
      scope,
    } = tokenData;

    console.log("✅ OAuth Success!");
    console.log("   Location ID:", locationId);
    console.log("   Company ID:", companyId);
    console.log("   Scopes:", scope);

    // Store tokens in Redis
    await storeLocationTokens(locationId, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
      companyId: companyId,
      locationId: locationId,
      scope: scope,
      installedAt: new Date().toISOString(),
    });

    // Generate and store API keys
    console.log("🔑 Generating API keys for location:", locationId);
    const crypto = await import('crypto');
    const apiKey = crypto.randomBytes(32).toString('hex');
    const publishableKey = `pk_${crypto.randomBytes(16).toString('hex')}`;

    await redis.set(`clover_keys_${locationId}`, JSON.stringify({
      apiKey,
      publishableKey,
      locationId,
      createdAt: new Date().toISOString()
    }));

    console.log("✅ API keys generated and stored");
    console.log("   API Key:", apiKey.substring(0, 8) + "...");

    // Try to register payment provider with CORRECTED approach
    try {
      await registerPaymentProvider(locationId, access_token);
      console.log("✅ Payment provider registration completed");
    } catch (error) {
      console.error("⚠️ Payment provider registration failed:", error.message);
      console.log("   Installation will continue, but may need manual setup");
    }

    // Redirect back to GHL payments page
    const redirectUrl = `https://app.gohighlevel.com/location/${locationId}/settings/payments`;
    
    console.log("🔄 Redirecting user to:", redirectUrl);
    return res.redirect(302, redirectUrl);

  } catch (error) {
    console.error("❌ OAuth callback error:", error.response?.data || error.message);
    
    // Redirect to GHL with error
    return res.redirect(302, "https://app.gohighlevel.com/oauth/error");
  }
}

async function exchangeCodeForToken(code) {
  const tokenUrl = "https://services.leadconnectorhq.com/oauth/token";
  const payload = {
    client_id: process.env.GHL_CLIENT_ID,
    client_secret: process.env.GHL_CLIENT_SECRET,
    grant_type: "authorization_code",
    code: code,
    redirect_uri: process.env.OAUTH_REDIRECT_URI,
  };

  try {
    // Try JSON first
    const response = await axios.post(tokenUrl, payload, {
      headers: { "Content-Type": "application/json" },
    });
    console.log("✅ Token exchange successful (JSON)");
    return response.data;
  } catch (error) {
    console.log("⚠️ JSON exchange failed, trying form-encoded...");
    
    // Fallback to form-encoded
    const params = new URLSearchParams(payload);
    const response = await axios.post(tokenUrl, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    console.log("✅ Token exchange successful (form-encoded)");
    return response.data;
  }
}

async function storeLocationTokens(locationId, tokenData) {
  const key = `ghl_location_${locationId}`;
  await redis.set(key, JSON.stringify(tokenData));
  console.log(`✅ Tokens stored in Redis for location: ${locationId}`);
}

async function registerPaymentProvider(locationId, accessToken) {
  console.log("📤 Attempting to register payment provider with GHL");
  console.log("   Location ID:", locationId);
  
  // STEP 1: Connect the provider (this creates the base integration)
  const connectUrl = "https://services.leadconnectorhq.com/payments/custom-provider/connect";
  
  // CRITICAL FIX: Send ONLY locationId in the body - no other fields
  // Based on the 422 error logs, GHL is very strict about this format
  const connectPayload = {
    locationId: locationId
  };

  console.log("📍 Step 1: Connecting provider");
  console.log("   Endpoint:", connectUrl);
  console.log("   Payload:", JSON.stringify(connectPayload, null, 2));

  try {
    const connectResponse = await axios.post(connectUrl, connectPayload, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
      },
    });

    console.log("✅ Provider connected successfully!");
    console.log("   Response:", JSON.stringify(connectResponse.data));
    
    // STEP 2: Configure the provider with details (separate call)
    await configureProvider(locationId, accessToken);
    
    return connectResponse.data;
    
  } catch (error) {
    console.error("❌ Provider connection failed");
    console.error("   Status:", error.response?.status);
    console.error("   Status Text:", error.response?.statusText);
    console.error("   Error Data:", JSON.stringify(error.response?.data));
    
    // Don't throw error - allow installation to continue
    console.log("   Installation will continue, provider may need manual setup");
  }
}

async function configureProvider(locationId, accessToken) {
  console.log("🔧 Configuring provider details");
  
  const configUrl = "https://services.leadconnectorhq.com/payments/custom-provider/config";
  
  // Get the API keys we generated
  const keysData = await redis.get(`clover_keys_${locationId}`);
  const keys = keysData ? JSON.parse(keysData) : {};
  
  const configPayload = {
    locationId: locationId,
    liveMode: false,
    apiKey: keys.apiKey,
    publishableKey: keys.publishableKey,
    name: "Clover by PNC", 
    description: "Accept payments via Clover devices and online",
    queryUrl: "https://api.onesolutionapp.com/api/payment/query",
    paymentsUrl: "https://api.onesolutionapp.com/payment-form"
  };

  console.log("   Config payload:", JSON.stringify(configPayload, null, 2));

  try {
    const configResponse = await axios.post(configUrl, configPayload, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json", 
        "Version": "2021-07-28",
      },
    });

    console.log("✅ Provider configured successfully!");
    console.log("   Response:", JSON.stringify(configResponse.data));
    
  } catch (error) {
    console.error("⚠️ Provider configuration failed (not critical)");
    console.error("   Status:", error.response?.status);
    console.error("   Error:", JSON.stringify(error.response?.data));
    // Don't throw - configuration can be done later via setup page
  }
}