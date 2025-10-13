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
      locationId: locationId, // Store it explicitly
      scope: scope,
      installedAt: new Date().toISOString(),
    });

    // Try to register payment provider
    try {
      await registerPaymentProvider(locationId, access_token);
      console.log("✅ Payment provider registration attempted");
    } catch (error) {
      console.error("⚠️ Payment provider registration failed:", error.message);
      console.log("   Continuing with installation...");
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
  
  // Try the standard custom provider endpoint
  const connectUrl = "https://services.leadconnectorhq.com/payments/custom-provider/connect";
  
  const payload = {
    locationId: locationId,
    liveMode: false
  };

  console.log("   Endpoint:", connectUrl);
  console.log("   Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(connectUrl, payload, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
      },
    });

    console.log("✅ Payment provider registered successfully!");
    console.log("   Response:", JSON.stringify(response.data));
    return response.data;
    
  } catch (error) {
    console.error("❌ Payment provider registration failed");
    console.error("   Status:", error.response?.status);
    console.error("   Status Text:", error.response?.statusText);
    console.error("   Error Data:", JSON.stringify(error.response?.data));
    
    // Try alternative endpoint if first one fails
    if (error.response?.status === 422) {
      console.log("   Trying alternative registration method...");
      
      try {
        const altUrl = "https://services.leadconnectorhq.com/payments/integrations/provider/connect";
        const altPayload = {
          locationId: locationId,
          provider: "clover",
          live: false
        };
        
        console.log("   Alternative endpoint:", altUrl);
        console.log("   Alternative payload:", JSON.stringify(altPayload, null, 2));
        
        const altResponse = await axios.post(altUrl, altPayload, {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Version": "2021-07-28",
          },
        });
        
        console.log("✅ Alternative registration successful!");
        console.log("   Response:", JSON.stringify(altResponse.data));
        return altResponse.data;
        
      } catch (altError) {
        console.error("❌ Alternative registration also failed");
        console.error("   Status:", altError.response?.status);
        console.error("   Error:", JSON.stringify(altError.response?.data));
      }
    }
    
    // Don't throw - allow installation to continue
    console.log("   Installation will continue, but payment provider may need manual setup");
  }
}