import { Redis } from "@upstash/redis";
import axios from "axios";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export async function getCloverConfig(locationId) {
  const configKey = `clover_config_${locationId}`;
  const config = await redis.get(configKey);
  
  if (!config) {
    throw new Error('Clover configuration not found. Please complete the setup process.');
  }

  return JSON.parse(config);
}

export async function verifyCloverCredentials(merchantId, apiToken) {
  try {
    const response = await axios.get(
      `https://api.clover.com/v3/merchants/${merchantId}`,
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      verified: true,
      merchantName: response.data.name
    };
  } catch (error) {
    console.error('Clover verification error:', error.response?.data || error.message);
    return {
      verified: false,
      error: 'Failed to verify Clover credentials'
    };
  }
}