// api/utils/tokenStorage.js
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export async function storeLocationTokens(locationId, tokenData) {
  const key = `location_tokens_${locationId}`;
  await redis.set(key, JSON.stringify(tokenData));
}

export async function isCloverConfigured(locationId) {
  const key = `location_tokens_${locationId}`;
  const tokens = await redis.get(key);
  return !!tokens;
}

export async function getLocationTokens(locationId) {
  const key = `location_tokens_${locationId}`;
  const tokens = await redis.get(key);
  return tokens ? JSON.parse(tokens) : null;
}