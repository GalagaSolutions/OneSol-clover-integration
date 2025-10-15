import { Redis } from "@upstash/redis";
import axios from "axios";
import { getLocationToken } from "./utils/getLocationToken.js";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { locationId, action } = req.query;

  // Action: Check Clover connection
  if (action === "clover") {
    return res.status(200).json({
      connected: !!(process.env.CLOVER_MERCHANT_ID && process.env.CLOVER_API_TOKEN),
      merchantId: process.env.CLOVER_MERCHANT_ID ? `${process.env.CLOVER_MERCHANT_ID.substring(0, 4)}...` : "NOT SET",
      hasApiToken: !!process.env.CLOVER_API_TOKEN,
      hasPakmsKey: !!process.env.CLOVER_PAKMS_KEY,
      environment: process.env.CLOVER_ENVIRONMENT || "NOT SET",
    });
  }

  // Action: Force register integration (admin)
  if (action === "register" && locationId) {
    try {
      const accessToken = await getLocationToken(locationId);
      const baseUrl = process.env.VERCEL_URL || 'api.onesolutionapp.com';
      
      const url = `https://services.leadconnectorhq.com/payments/custom-provider/provider?locationId=${locationId}`;
      
      const payload = {
        name: "Clover by PNC",
        description: "Accept payments via Clover devices and online",
        imageUrl: "https://www.clover.com/assets/images/public-site/press/clover_logo_primary.png",
        queryUrl: `https://${baseUrl}/api/payment/query`,
        paymentsUrl: `https://${baseUrl}/payment-form`,
      };

      const response = await axios.post(url, payload, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Version": "2021-07-28",
        },
      });

      return res.status(200).json({
        success: true,
        message: "Integration registered successfully!",
        response: response.data
      });
    } catch (error) {
      return res.status(200).json({
        success: false,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
    }
  }

  // Action: Check token status
  if (locationId && !action) {
    try {
      const key = `ghl_location_${locationId}`;
      const tokenData = await redis.get(key);
      
      if (!tokenData) {
        return res.status(404).json({ 
          error: "No tokens found",
          locationId: locationId,
          message: "OAuth not completed. Need to install app."
        });
      }

      const parsedData = typeof tokenData === 'string' ? JSON.parse(tokenData) : tokenData;
      
      // Check if integration exists
      let integrationStatus = "unknown";
      try {
        const accessToken = await getLocationToken(locationId);
        const checkUrl = `https://services.leadconnectorhq.com/payments/custom-provider/provider?locationId=${locationId}`;
        
        const checkResponse = await axios.get(checkUrl, {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Version": "2021-07-28",
          },
        });
        
        integrationStatus = checkResponse.data ? "registered" : "not_registered";
      } catch (error) {
        integrationStatus = error.response?.status === 404 ? "not_registered" : "error_checking";
      }
      
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
        integrationStatus: integrationStatus,
        nextStep: integrationStatus === "not_registered" 
          ? `Call /api/diagnostics?locationId=${locationId}&action=register to register integration`
          : "Check Settings > Payments > Integrations in GHL"
      });
      
    } catch (error) {
      return res.status(500).json({ 
        error: "Failed to retrieve diagnostics",
        message: error.message 
      });
    }
  }

  // Default: Show usage
  return res.status(200).json({
    usage: "Diagnostics Endpoint",
    endpoints: {
      "Check tokens": "/api/diagnostics?locationId=YOUR_LOCATION_ID",
      "Check Clover": "/api/diagnostics?action=clover",
      "Register integration": "/api/diagnostics?locationId=YOUR_LOCATION_ID&action=register"
    }
  });
}