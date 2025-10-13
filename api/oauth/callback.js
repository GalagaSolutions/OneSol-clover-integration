// api/oauth/callback.js
// CORRECTED VERSION following official GHL V2 OAuth flow
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
    
    // Extract IDs from token response
    const locationId = tokenData.locationId || tokenData.location_id;
    const companyId = tokenData.companyId || tokenData.company_id;
    const userId = tokenData.userId || tokenData.user_id;
    
    if (!locationId) {
      console.error("❌ No locationId in token response");
      throw new Error("locationId not found in OAuth response");
    }

    const {
      access_token,
      refresh_token,
      expires_in,
      scope,
    } = tokenData;

    // Validate required scopes
    const requiredScopes = ['payments.write', 'invoices.write'];
    const tokenScopes = scope.split(' ');
    const missingScopes = requiredScopes.filter(s => !tokenScopes.includes(s));
    
    if (missingScopes.length > 0) {
      console.error("❌ Missing required scopes:", missingScopes);
      throw new Error(`Missing required scopes: ${missingScopes.join(', ')}`);
    }

    console.log("✅ OAuth tokens received!");
    console.log("   Location ID:", locationId);
    console.log("   Company ID:", companyId);
    console.log("   User ID:", userId);
    console.log("   Scopes:", scope);
    console.log("   Expires in:", expires_in, "seconds");

    // Store tokens in Redis
    await storeLocationTokens(locationId, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + (expires_in * 1000),
      companyId: companyId,
      locationId: locationId,
      userId: userId,
      scope: scope,
      installedAt: new Date().toISOString(),
    });

    console.log("✅ Tokens stored in Redis");

    // Check if Clover is already configured for this location
    const cloverConfigured = await isCloverConfigured(locationId);
    
    if (cloverConfigured) {
      console.log("✅ Clover already configured - redirecting to GHL");
      
      // Redirect to GHL Payments Integrations page
      const redirectUrl = `https://app.gohighlevel.com/location/${locationId}/settings/payments/integrations`;
      return res.redirect(302, redirectUrl);
    }

    console.log("⚠️  Clover not configured - redirecting to setup page");

    // Build setup page URL with location context
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : process.env.BASE_URL;
    
    // Redirect to the enhanced setup page
    const setupUrl = `${baseUrl}/api/setup?locationId=${locationId}&companyId=${companyId || ''}&state=clover_setup`;
    
    console.log("🔄 Redirecting to Clover setup:", setupUrl);
    return res.redirect(302, setupUrl);

  } catch (error) {
    console.error("❌ OAuth callback error:");
    console.error("   Message:", error.message);
    console.error("   Response:", error.response?.data);
    console.error("   Stack:", error.stack);
    
    // Redirect to GHL error page
    return res.redirect(302, "https://app.gohighlevel.com/oauth/error");
  }
}

/**
 * Exchange authorization code for access/refresh tokens
 */
async function exchangeCodeForToken(code) {
  const tokenUrl = "https://services.leadconnectorhq.com/oauth/token";
  
  const payload = {
    client_id: process.env.GHL_CLIENT_ID,
    client_secret: process.env.GHL_CLIENT_SECRET,
    grant_type: "authorization_code",
    code: code,
    redirect_uri: process.env.OAUTH_REDIRECT_URI,
  };

  console.log("📤 Token exchange request:");
  console.log("   URL:", tokenUrl);
  console.log("   Client ID:", payload.client_id?.substring(0, 10) + "...");
  console.log("   Redirect URI:", payload.redirect_uri);

  try {
    // Try JSON content-type first (preferred)
    const response = await axios.post(tokenUrl, payload, {
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });
    
    console.log("✅ Token exchange successful (JSON)");
    return response.data;
    
  } catch (jsonError) {
    console.log("⚠️  JSON exchange failed, trying form-encoded...");
    console.log("   Error:", jsonError.response?.status, jsonError.response?.data);
    
    // Fallback to form-encoded (some OAuth servers prefer this)
    try {
      const params = new URLSearchParams(payload);
      const response = await axios.post(tokenUrl, params.toString(), {
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
      });
      
      console.log("✅ Token exchange successful (form-encoded)");
      return response.data;
      
    } catch (formError) {
      console.error("❌ Both token exchange methods failed");
      console.error("   JSON error:", jsonError.response?.data);
      console.error("   Form error:", formError.response?.data);
      throw formError;
    }
  }
}

/**
 * Store OAuth tokens in Redis
 */
async function storeLocationTokens(locationId, tokenData) {
  const key = `ghl_location_${locationId}`;
  
  await redis.set(key, JSON.stringify(tokenData));
  
  console.log(`✅ Tokens stored: ${key}`);
  console.log("   Expires:", new Date(tokenData.expiresAt).toISOString());
}

/**
 * Check if Clover is already configured for this location
 */
async function isCloverConfigured(locationId) {
  try {
    const key = `clover_config_${locationId}`;
    const config = await redis.get(key);
    
    if (!config) {
      console.log("   No Clover config found");
      return false;
    }
    
    const parsed = typeof config === 'string' ? JSON.parse(config) : config;
    const hasRequiredFields = !!(parsed.merchantId && parsed.apiToken);
    
    console.log("   Clover config exists:", hasRequiredFields);
    return hasRequiredFields;
    
  } catch (error) {
    console.error("   Error checking Clover config:", error.message);
    return false;
  }
}