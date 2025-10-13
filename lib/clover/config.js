import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

const CONFIG_PREFIX = "clover_config_";

export async function storeCloverConfig(locationId, config) {
  if (!locationId) {
    throw new Error("Missing locationId when storing Clover configuration");
  }

  const key = `${CONFIG_PREFIX}${locationId}`;
  await redis.set(key, JSON.stringify(config));

  return config;
}

export async function fetchCloverConfig(locationId) {
  if (!locationId) {
    return null;
  }

  const key = `${CONFIG_PREFIX}${locationId}`;
  const data = await redis.get(key);

  if (!data) {
    return null;
  }

  return typeof data === "string" ? JSON.parse(data) : data;
}
