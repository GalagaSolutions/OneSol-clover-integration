import { Redis } from "@upstash/redis";
import { getLocationToken } from "../../lib/getLocationToken.js";
import { tryCloverProviderEndpoints } from "../../lib/ghl/payments.js";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

const ACTION_HANDLERS = {
  async diagnostics(req, res) {
    const { locationId, check, test, companyId } = req.query;

    if (test === "register") {
      return sendRegistrationResult(
        res,
        await runRegistrationAttempts(locationId, { companyId })
      );
    }

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

    if (!locationId) {
      return res.status(400).json({
        error: "Missing locationId parameter",
        usage:
          "Add ?locationId=YOUR_LOCATION_ID or ?check=clover or ?test=register&locationId=YOUR_ID",
      });
    }

    try {
      const key = `ghl_location_${locationId}`;
      const tokenData = await redis.get(key);

      if (!tokenData) {
        return res.status(404).json({
          error: "No tokens found for this location",
          locationId,
          key,
          message: "OAuth not completed. Need to install app.",
        });
      }

      const parsedData = typeof tokenData === "string" ? JSON.parse(tokenData) : tokenData;

      return res.status(200).json({
        success: true,
        locationId,
        hasAccessToken: !!parsedData.accessToken,
        hasRefreshToken: !!parsedData.refreshToken,
        tokenExpires: new Date(parsedData.expiresAt).toISOString(),
        isExpired: Date.now() >= parsedData.expiresAt,
        installedAt: parsedData.installedAt,
        companyId: parsedData.companyId,
        scopes: parsedData.scope,
        scopeCount: parsedData.scope?.split(" ").length || 0,
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to retrieve token",
        message: error.message,
      });
    }
  },

  async "register-provider"(req, res) {
    const { locationId, companyId } = req.query;

    if (!locationId) {
      return res.status(400).json({
        error: "locationId required",
        usage: "Add ?locationId=YOUR_LOCATION_ID to the URL",
      });
    }

    const result = await runRegistrationAttempts(locationId, {
      verbose: true,
      companyId,
    });
    return sendRegistrationResult(res, result);
  },
};

export default async function handler(req, res) {
  const actionParam = req.query.action;
  const action = Array.isArray(actionParam) ? actionParam[0] : actionParam;

  const handler = action ? ACTION_HANDLERS[action] : null;
  if (!handler) {
    return res.status(404).json({ error: "Not found" });
  }

  return handler(req, res);
}

async function runRegistrationAttempts(locationId, options = {}) {
  if (!locationId) {
    return {
      status: 400,
      body: {
        error: "locationId required",
        usage: "Provide a locationId to test registration",
      },
    };
  }

  try {
    if (options.verbose) {
      console.log("🧪 Testing payment provider registration");
      console.log("   Location ID:", locationId);
    }

    const accessToken = await getLocationToken(locationId);
    if (options.verbose) {
      console.log("   ✅ Access token retrieved");
    }

    const results = await tryCloverProviderEndpoints(accessToken, locationId, {
      includeProviderCreation: Boolean(options.companyId),
      companyId: options.companyId,
      logger: options.verbose ? console : undefined,
    });

    const successCount = results.filter((result) => result.success).length;

    return {
      status: 200,
      body: {
        message: "Payment provider registration test complete",
        summary: {
          totalAttempts: results.length,
          successful: successCount,
          failed: results.length - successCount,
        },
        results,
        recommendation:
          successCount > 0
            ? "✅ Found working endpoint!"
            : "❌ No endpoints worked.",
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        error: error.message,
      },
    };
  }
}

function sendRegistrationResult(res, result) {
  if (!result) {
    return res.status(500).json({ error: "Unknown registration result" });
  }

  return res.status(result.status).json(result.body);
}
