import { Redis } from "@upstash/redis";
import axios from "axios";
import { getLocationToken } from "../utils/getLocationToken.js";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { locationId, check, test } = req.query;

  // Test payment provider registration
  if (test === "register") {
    return await testPaymentProviderRegistration(locationId, res);
  }

  // Check Clover connection
  if (check === "clover") {
    const merchantId = process.env.CLOVER_MERCHANT_ID;
    const apiToken = process.env.CLOVER_API_TOKEN;
    const pakmsKey = process.env.CLOVER_PAKMS_KEY;
    const environment = process.env.CLOVER_ENVIRONMENT;

    return res.status(200).json({
      connected: !!(merchantId && apiToken && environment),
      merchantId: merchantId ? `${merchantId.substring(0, 4)}...` : "NOT SET",
      hasApiToken: !!apiToken,
      hasPakmsKey: !!pakmsKey,
      environment: environment || "NOT SET",
    });
  }

  // Check token status
  if (!locationId) {
    return res.status(400).json({ 
      error: "Missing locationId parameter",
      usage: "Add ?locationId=YOUR_LOCATION_ID or ?check=clover or ?test=register&locationId=YOUR_ID"
    });
  }

  try {
    const key = `ghl_location_${locationId}`;
    const tokenData = await redis.get(key);
    
    if (!tokenData) {
      return res.status(404).json({ 
        error: "No tokens found for this location",
        locationId: locationId,
        key: key,
        message: "OAuth not completed. Need to install app."
      });
    }

    const parsedData = typeof tokenData === 'string' ? JSON.parse(tokenData) : tokenData;
    
    return res.status(200).json({
      success: true,
      locationId: locationId,
      hasAccessToken: !!parsedData.accessToken,
      hasRefreshToken: !!parsedData.refreshToken,
      tokenExpires: new Date(parsedData.expiresAt).toISOString(),
      isExpired: Date.now() >= parsedData.expiresAt,
      installedAt: parsedData.installedAt,
      companyId: parsedData.companyId,
      scopes: parsedData.scope,
      scopeCount: parsedData.scope?.split(' ').length || 0,
    });
    
  } catch (error) {
    return res.status(500).json({ 
      error: "Failed to retrieve token",
      message: error.message 
    });
  }
}

async function testPaymentProviderRegistration(locationId, res) {
  if (!locationId) {
    return res.status(400).json({ 
      error: "locationId required",
      usage: "Add ?test=register&locationId=YOUR_LOCATION_ID"
    });
  }

  try {
    console.log("🧪 Testing payment provider registration");
    const accessToken = await getLocationToken(locationId);
    const results = [];
    
    // Attempt 1: Minimal payload
    try {
      const r1 = await axios.post(
        "https://services.leadconnectorhq.com/payments/custom-provider/connect",
        { locationId },
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Version": "2021-07-28",
          },
        }
      );
      results.push({ attempt: 1, endpoint: "custom-provider/connect (minimal)", success: true, data: r1.data });
    } catch (e) {
      results.push({ attempt: 1, endpoint: "custom-provider/connect (minimal)", success: false, status: e.response?.status, error: e.response?.data });
    }
    
    // Attempt 2: Full payload
    try {
      const r2 = await axios.post(
        "https://services.leadconnectorhq.com/payments/custom-provider/connect",
        { locationId, liveMode: false, name: "Clover by PNC", description: "Accept payments via Clover" },
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Version": "2021-07-28",
          },
        }
      );
      results.push({ attempt: 2, endpoint: "custom-provider/connect (full)", success: true, data: r2.data });
    } catch (e) {
      results.push({ attempt: 2, endpoint: "custom-provider/connect (full)", success: false, status: e.response?.status, error: e.response?.data });
    }
    
    // Attempt 3: Alternative endpoint
    try {
      const r3 = await axios.post(
        "https://services.leadconnectorhq.com/payments/integrations/provider/connect",
        { locationId, provider: "clover", live: false },
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Version": "2021-07-28",
          },
        }
      );
      results.push({ attempt: 3, endpoint: "integrations/provider/connect", success: true, data: r3.data });
    } catch (e) {
      results.push({ attempt: 3, endpoint: "integrations/provider/connect", success: false, status: e.response?.status, error: e.response?.data });
    }

    const successCount = results.filter(r => r.success).length;

    return res.status(200).json({
      message: "Payment provider registration test complete",
      summary: { totalAttempts: results.length, successful: successCount, failed: results.length - successCount },
      results,
      recommendation: successCount > 0 ? "✅ Found working endpoint!" : "❌ No endpoints worked."
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}