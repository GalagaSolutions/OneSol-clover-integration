import axios from "axios";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  try {
    const { code } = req.query;

    const cleanId = (value) => {
      if (!value) return null;
      const trimmed = String(value).trim();
      if (!trimmed || trimmed.includes("{{") || trimmed.includes("}}") || trimmed === "undefined" || trimmed === "null") {
        return null;
      }
      return trimmed;
    };

    if (!code) {
      console.error("❌ No authorization code provided");
      return res.status(400).send("Missing authorization code");
    }

    console.log("🔄 Exchanging authorization code for tokens...");

    // Exchange code for tokens
    const tokenData = await exchangeCodeForToken(code);
    
    // Debug logging
    console.log("🔍 FULL TOKEN RESPONSE:", JSON.stringify(tokenData, null, 2));
    console.log("🔍 Looking for locationId in:", {
      locationId: tokenData.locationId,
      location_id: tokenData.location_id,
      allKeys: Object.keys(tokenData)
    });
    
    // Extract location/company IDs from token response + query fallback
    const locationId = cleanId(
      tokenData.locationId ||
      tokenData.location_id ||
      tokenData.location?.id ||
      tokenData.location?.locationId ||
      tokenData.user?.locationId ||
      req.query.locationId ||
      req.query.location_id ||
      req.query.subAccountId
    );

    const companyId = cleanId(
      tokenData.companyId ||
      tokenData.company_id ||
      tokenData.company?.id ||
      tokenData.user?.companyId ||
      req.query.companyId ||
      req.query.company_id
    );
    
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
    console.log("💾 Storing tokens in Redis...");
    await storeLocationTokens(locationId, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
      companyId: companyId,
      locationId: locationId,
      scope: scope,
      installedAt: new Date().toISOString(),
    });
    console.log("✅ Tokens stored successfully");

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

    // Store integration status FIRST (before trying registration)
    console.log("💾 Storing basic integration status...");
    await redis.set(`integration_status_${locationId}`, JSON.stringify({
      status: "oauth_completed",
      timestamp: Date.now(),
      hasApiKeys: true,
      hasTokens: true,
      needsCloverConfig: true
    }));
    console.log("✅ Basic status stored");

    console.log("💡 OAuth completed successfully, redirecting to setup...");

    // Redirect to setup page to collect Clover credentials
    const setupUrl = `https://api.onesolutionapp.com/setup?locationId=${locationId}&companyId=${companyId}&status=oauth_success`;
    
    console.log("🔄 Redirecting user to setup page:", setupUrl);
    return res.redirect(302, setupUrl);

  } catch (error) {
    console.error("❌ OAuth callback error details:");
    console.error("   Error name:", error.name);
    console.error("   Error message:", error.message);
    console.error("   Error stack:", error.stack);
    console.error("   Full error:", error);
    
    // Redirect to setup page with error and preserve any known context
    const fallbackLocationId = encodeURIComponent(req.query.locationId || req.query.location_id || req.query.subAccountId || "");
    const fallbackCompanyId = encodeURIComponent(req.query.companyId || req.query.company_id || "");
    const errorUrl = `https://api.onesolutionapp.com/setup?error=${encodeURIComponent(error.message)}${fallbackLocationId ? `&locationId=${fallbackLocationId}` : ""}${fallbackCompanyId ? `&companyId=${fallbackCompanyId}` : ""}`;
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
