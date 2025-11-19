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
    console.log("🔍 FULL TOKEN RESPONSE:", JSON.stringify(tokenData, null, 2));
    console.log("🔍 Looking for locationId in:", {
  locationId: tokenData.locationId,
  location_id: tokenData.location_id,
  allKeys: Object.keys(tokenData)
});

    // Extract location ID - try multiple possible locations in response
    const locationId = tokenData.locationId || tokenData.location_id;
    const companyId = tokenData.companyId || tokenData.company_id;
    console.log("🔍 EXTRACTED VALUES:", { locationId, companyId });
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

    // Generate and store API keys (these will be used by GHL when calling our query endpoint)
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
    console.log("   Publishable Key:", publishableKey.substring(0, 10) + "...");

    // Register payment integration with GHL - THIS IS THE MISSING PIECE!
    console.log("📤 Registering payment integration with GHL...");
    try {
      const baseUrl = process.env.CUSTOM_DOMAIN || 'api.onesolutionapp.com';
      
      const integrationUrl = "https://services.leadconnectorhq.com/oauth/integrations";
      const integrationPayload = {
        name: "Clover by PNC",
        description: "Accept payments via Clover devices and online",
        locationId: locationId,
        queryUrl: `https://${baseUrl}/payments/query`,
        paymentsUrl: `https://${baseUrl}/payment-iframe`
      };

      console.log("📤 Integration payload:", JSON.stringify(integrationPayload, null, 2));

      const integrationResponse = await axios.post(integrationUrl, integrationPayload, {
        headers: {
          "Authorization": `Bearer ${access_token}`,
          "Content-Type": "application/json",
          "Version": "2021-07-28",
        },
      });

      console.log("✅ Payment integration registered!");
      console.log("   Response:", JSON.stringify(integrationResponse.data, null, 2));

      // Set provider configuration with API keys
      const configUrl = "https://services.leadconnectorhq.com/payments/custom-provider/config";
      const configPayload = {
        locationId: locationId,
        liveMode: false,
        apiKey: apiKey,
        publishableKey: publishableKey
      };

      const configResponse = await axios.post(configUrl, configPayload, {
        headers: {
          "Authorization": `Bearer ${access_token}`,
          "Content-Type": "application/json",
          "Version": "2021-07-28",
        },
      });

      console.log("✅ Provider config set!");
      console.log("   Response:", JSON.stringify(configResponse.data, null, 2));

      // Store successful integration status
      await redis.set(`integration_status_${locationId}`, JSON.stringify({
        status: "integration_registered",
        timestamp: Date.now(),
        hasApiKeys: true,
        hasTokens: true,
        integrationRegistered: true,
        configSet: true
      }));

    } catch (error) {
      console.error("⚠️ Integration registration failed:", error.response?.data || error.message);
      console.error("   Status:", error.response?.status);
      
      // Store failed status but continue - user can configure manually
      await redis.set(`integration_status_${locationId}`, JSON.stringify({
        status: "integration_failed",
        timestamp: Date.now(),
        hasApiKeys: true,
        hasTokens: true,
        integrationRegistered: false,
        error: error.response?.data || error.message,
        needsManualSetup: true
      }));
      
      console.log("⚠️ Integration registration failed but continuing...");
    }

    console.log("✅ Integration status stored");
    console.log("💡 User needs to complete Clover setup in the next step");

    // Redirect to setup page to collect Clover credentials
    const setupUrl = `https://api.onesolutionapp.com/setup?locationId=${locationId}&companyId=${companyId}&status=oauth_success`;
    
    console.log("🔄 Redirecting user to setup page:", setupUrl);
    return res.redirect(302, setupUrl);

  } catch (error) {
    console.error("❌ OAuth callback error:", error.response?.data || error.message);
    
    // Redirect to setup page with error
    const errorUrl = `https://api.onesolutionapp.com/setup?error=${encodeURIComponent(error.message)}`;
    return res.redirect(302, errorUrl);
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