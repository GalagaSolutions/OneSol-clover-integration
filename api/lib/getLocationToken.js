import axios from "axios";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export async function getLocationToken(locationId) {
  const key = `ghl_location_${locationId}`;
  const tokenData = await redis.get(key);

  if (!tokenData) {
    throw new Error(`No tokens found for location: ${locationId}`);
  }

  // Check if tokenData is already an object or needs parsing
  const parsedData = typeof tokenData === 'string' ? JSON.parse(tokenData) : tokenData;

  // Check if token is expired
  if (Date.now() >= parsedData.expiresAt) {
    console.log("🔄 Token expired, refreshing...");
    return await refreshLocationToken(locationId, parsedData);
  }

  return parsedData.accessToken;
}

async function refreshLocationToken(locationId, tokenData) {
  const tokenUrl = "https://services.leadconnectorhq.com/oauth/token";
  
  const response = await axios.post(tokenUrl, {
    client_id: process.env.GHL_CLIENT_ID,
    client_secret: process.env.GHL_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: tokenData.refreshToken,
  }, {
    headers: { "Content-Type": "application/json" },
  });

  const { access_token, refresh_token, expires_in } = response.data;

  // Update stored tokens
  const updatedData = {
    ...tokenData,
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: Date.now() + expires_in * 1000,
  };

  await redis.set(`ghl_location_${locationId}`, JSON.stringify(updatedData));

  console.log("✅ Token refreshed for location:", locationId);
  return access_token;
}