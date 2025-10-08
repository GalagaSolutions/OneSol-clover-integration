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
    const tokenData = await redis.get(key);
    
    if (!tokenData) {
      return res.status(404).json({ 
        error: "No tokens found for this location",
        locationId: locationId,
        key: key 
      });
    }

    // Handle both string and object responses from Redis
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
      scopeCount: parsedData.scope?.split(' ').length || 0,
    });
    
  } catch (error) {
    return res.status(500).json({ 
      error: "Failed to retrieve token",
      message: error.message 
    });
  }
}