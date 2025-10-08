import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { locationId } = req.query;
  
  if (!locationId) {
    return res.status(400).json({ 
      error: "Missing locationId parameter",
      usage: "Add ?locationId=YOUR_LOCATION_ID to the URL"
    });
  }

  try {
    const key = `ghl_location_${locationId}`;
    const tokenDataStr = await redis.get(key);
    
    if (!tokenDataStr) {
      return res.status(404).json({ 
        error: "No tokens found for this location",
        locationId: locationId,
        key: key 
      });
    }

    const tokenData = JSON.parse(tokenDataStr);
    
    return res.status(200).json({
      success: true,
      locationId: locationId,
      hasAccessToken: !!tokenData.accessToken,
      hasRefreshToken: !!tokenData.refreshToken,
      tokenExpires: new Date(tokenData.expiresAt).toISOString(),
      isExpired: Date.now() >= tokenData.expiresAt,
      installedAt: tokenData.installedAt,
      companyId: tokenData.companyId,
      scopeCount: tokenData.scope?.split(' ').length || 0,
    });
    
  } catch (error) {
    return res.status(500).json({ 
      error: "Failed to retrieve token",
      message: error.message 
    });
  }
}