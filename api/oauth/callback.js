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

    // Try to register payment provider
    try {
      await registerPaymentProvider(locationId, access_token, apiKey, publishableKey);
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

async function registerPaymentProvider(locationId, accessToken, apiKey, publishableKey) {
  console.log("📤 Attempting to register payment provider with GHL");
  console.log("   Location ID:", locationId);
  
  const registrationPayload = {
    name: "Clover by PNC",
    description: "Accept payments via Clover",
    imageUrl: "https://api.onesolutionapp.com/assets/clover-icon.png",
    locationId: locationId,
    queryUrl: "https://api.onesolutionapp.com/payments/query",
    paymentsUrl: `https://api.onesolutionapp.com/payment-form-simple?locationId=${locationId}`
  };

  console.log("   Registration payload:", JSON.stringify(registrationPayload, null, 2));

  // Try Method 1: OAuth Integrations endpoint (CORRECT METHOD)
  try {
    console.log("📍 Method 1: Trying /oauth/integrations endpoint...");
    const integrationUrl = "https://services.leadconnectorhq.com/oauth/integrations";
    
    const response = await axios.post(integrationUrl, registrationPayload, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
      },
    });

    console.log("✅ Integration registered successfully via /oauth/integrations!");
    console.log("   Response:", JSON.stringify(response.data));
    
    // Try to set config with API keys
    await setProviderConfig(locationId, accessToken, apiKey, publishableKey);
    
    return response.data;
    
  } catch (error1) {
    console.error("❌ Method 1 failed (/oauth/integrations)");
    console.error("   Status:", error1.response?.status);
    console.error("   Error:", JSON.stringify(error1.response?.data));
    
    // Try Method 2: Custom Provider Config (FALLBACK)
    try {
      console.log("📍 Method 2: Trying /payments/custom-provider/config endpoint...");
      const configUrl = "https://services.leadconnectorhq.com/payments/custom-provider/config";
      
      const configPayload = {
        locationId: locationId,
        name: "Clover by PNC",
        liveMode: false,
        apiKey: apiKey,
        publishableKey: publishableKey,
        queryUrl: "https://api.onesolutionapp.com/payments/query",
        paymentsUrl: `https://api.onesolutionapp.com/payment-form-simple?locationId=${locationId}`
      };
      
      const response2 = await axios.post(configUrl, configPayload, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Version": "2021-07-28",
        },
      });
      
      console.log("✅ Provider config created successfully!");
      console.log("   Response:", JSON.stringify(response2.data));
      return response2.data;
      
    } catch (error2) {
      console.error("❌ Method 2 also failed (/custom-provider/config)");
      console.error("   Status:", error2.response?.status);
      console.error("   Error:", JSON.stringify(error2.response?.data));
      
      // Try Method 3: Custom Provider Connect (LAST RESORT)
      try {
        console.log("📍 Method 3: Trying /payments/custom-provider/connect endpoint...");
        const connectUrl = "https://services.leadconnectorhq.com/payments/custom-provider/connect";
        
        const response3 = await axios.post(connectUrl, { locationId }, {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Version": "2021-07-28",
          },
        });
        
        console.log("✅ Connected via /custom-provider/connect!");
        console.log("   Response:", JSON.stringify(response3.data));
        
        // Try to set config separately
        await setProviderConfig(locationId, accessToken, apiKey, publishableKey);
        
        return response3.data;
        
      } catch (error3) {
        console.error("❌ All registration methods failed");
        console.error("   Last error:", error3.response?.status, error3.response?.data);
        throw new Error("Payment provider registration failed on all attempts");
      }
    }
  }
}

async function setProviderConfig(locationId, accessToken, apiKey, publishableKey) {
  try {
    console.log("🔧 Setting provider config (test mode)...");
    
    await axios.post(
      "https://services.leadconnectorhq.com/payments/custom-provider/config",
      {
        locationId: locationId,
        liveMode: false,
        apiKey: apiKey,
        publishableKey: publishableKey
      },
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Version": "2021-07-28"
        }
      }
    );
    
    console.log("✅ Test mode config set successfully");
  } catch (error) {
    console.error("⚠️ Could not set provider config (may be okay):", error.response?.data);
  }
}