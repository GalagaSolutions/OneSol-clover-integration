import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { locationId, secret } = req.query;
  
  // Simple security check
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  if (!locationId) {
    return res.status(400).json({ error: 'locationId required' });
  }

  try {
    // Delete all data for this location
    const keys = [
      `ghl_location_${locationId}`,
      `clover_config_${locationId}`,
      `payment_provider_${locationId}`
    ];
    
    const results = {};
    for (const key of keys) {
      const deleted = await redis.del(key);
      results[key] = deleted ? 'deleted' : 'not found';
    }
    
    return res.status(200).json({
      success: true,
      locationId,
      message: 'All data deleted for location',
      results
    });
    
  } catch (error) {
    console.error('Error force-uninstalling:', error);
    return res.status(500).json({ 
      error: error.message 
    });
  }
}