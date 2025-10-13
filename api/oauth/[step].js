import axios from "axios";
import { Redis } from "@upstash/redis";
import { ensureCloverProviderConnection } from "../../lib/ghl/payments.js";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

const STEP_HANDLERS = {
  async callback(req, res) {
    try {
      const { code } = req.query;

      if (!code) {
        console.error("❌ No authorization code provided");
        return res.status(400).send("Missing authorization code");
      }

      console.log("🔄 Exchanging authorization code for tokens...");

      const tokenData = await exchangeCodeForToken(code);

      const locationId = tokenData.locationId || tokenData.location_id;
      const companyId = tokenData.companyId || tokenData.company_id;

      if (!locationId) {
        console.error("❌ No locationId found in token response:", tokenData);
        throw new Error("locationId not found in OAuth response");
      }

      const { access_token, refresh_token, expires_in, scope } = tokenData;

      console.log("✅ OAuth Success!");
      console.log("   Location ID:", locationId);
      console.log("   Company ID:", companyId);
      console.log("   Scopes:", scope);

      await storeLocationTokens(locationId, {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: Date.now() + expires_in * 1000,
        companyId,
        locationId,
        scope,
        installedAt: new Date().toISOString(),
      });

      try {
        const registration = await ensureCloverProviderConnection({
          accessToken: access_token,
          locationId,
          companyId,
        });

        if (registration.success) {
          console.log("✅ Payment provider registration attempted");
        } else {
          console.warn("⚠️ No registration attempts succeeded automatically");
        }
      } catch (error) {
        console.error("⚠️ Payment provider registration failed:", error.message);
        console.log("   Continuing with installation...");
      }

      const appBaseUrl = resolveAppBaseUrl(req);
      const redirectParams = new URLSearchParams({ locationId });
      if (companyId) {
        redirectParams.append("companyId", companyId);
      }
      const redirectUrl = buildRedirectUrl(
        appBaseUrl,
        "oauth/redirect.html",
        redirectParams
      );

      console.log("🔄 Redirecting installer to:", redirectUrl);
      return res.redirect(302, redirectUrl);
    } catch (error) {
      console.error("❌ OAuth callback error:", error.response?.data || error.message);
      return res.redirect(302, "https://app.gohighlevel.com/oauth/error");
    }
  },

};

export default async function handler(req, res) {
  const stepParam = req.query.step;
  const step = Array.isArray(stepParam) ? stepParam[0] : stepParam;

  const handler = step ? STEP_HANDLERS[step] : null;
  if (!handler) {
    return res.status(404).json({ error: "Not found" });
  }

  return handler(req, res);
}

async function exchangeCodeForToken(code) {
  const tokenUrl = "https://services.leadconnectorhq.com/oauth/token";
  const payload = {
    client_id: process.env.GHL_CLIENT_ID,
    client_secret: process.env.GHL_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.OAUTH_REDIRECT_URI,
  };

  try {
    const response = await axios.post(tokenUrl, payload, {
      headers: { "Content-Type": "application/json" },
    });
    console.log("✅ Token exchange successful (JSON)");
    return response.data;
  } catch (error) {
    console.log("⚠️ JSON exchange failed, trying form-encoded...");

    const params = new URLSearchParams(payload);
    const response = await axios.post(tokenUrl, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    console.log("✅ Token exchange successful (form-encoded)");
    return response.data;
  }
}

async function storeLocationTokens(locationId, tokenData) {
  const key = `ghl_location_${locationId}`;
  await redis.set(key, JSON.stringify(tokenData));
  console.log(`✅ Tokens stored in Redis for location: ${locationId}`);
}

function resolveAppBaseUrl(req) {
  const envBase = process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL;
  if (envBase) {
    return envBase.replace(/\/$/, "");
  }

  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  if (host) {
    return `${protocol}://${host}`.replace(/\/$/, "");
  }

  return "";
}

function buildRedirectUrl(baseUrl, path, params) {
  const trimmedBase = baseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const queryString = params?.toString?.() ? `?${params.toString()}` : "";

  if (!trimmedBase) {
    return `/${normalizedPath}${queryString}`;
  }

  return `${trimmedBase}/${normalizedPath}${queryString}`;
}
