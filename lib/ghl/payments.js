import axios from "axios";

const API_BASE = "https://services.leadconnectorhq.com/v2";
const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  Version: "2021-07-28",
};

function ghlHeaders(accessToken, extra = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...DEFAULT_HEADERS,
    ...extra,
  };
}

export async function recordPaymentOrder({
  accessToken,
  locationId,
  invoiceId,
  amount,
  transactionId,
  currency = "usd",
  paymentMode = "live",
}) {
  if (!accessToken) {
    throw new Error("Access token required to record payment");
  }

  if (!locationId) {
    throw new Error("Location ID required to record payment");
  }

  const url = `${API_BASE}/payments/orders`;
  const normalizedAmount = Math.round((Number(amount) || 0) * 100);

  const payload = {
    altId: invoiceId,
    altType: "invoice",
    amount: normalizedAmount,
    currency: currency.toLowerCase(),
    status: "succeeded",
    externalTransactionId: transactionId,
    transactionType: "charge",
    paymentMode,
  };

  const response = await axios.post(url, payload, {
    headers: ghlHeaders(accessToken, { "Location-Id": locationId }),
  });

  return response.data;
}

export async function tryCloverProviderEndpoints(
  accessToken,
  locationId,
  { companyId, liveMode = false, includeProviderCreation = false, stopOnSuccess = false, logger = console } = {}
) {
  if (!accessToken) {
    throw new Error("Access token required to connect provider");
  }

  if (!locationId) {
    throw new Error("locationId required to connect provider");
  }

  const attempts = [];

  if (includeProviderCreation && companyId) {
    attempts.push({
      label: "integration provider (whitelabel)",
      endpoint: `${API_BASE}/payments/integrations/provider/whitelabel`,
      payload: {
        name: "Clover by PNC",
        slug: "clover-by-pnc",
        description: "Accept payments via Clover hardware and ecommerce.",
        capabilities: ["charge", "refund"],
        paymentModes: ["live", "test"],
        processor: "clover",
        companyId,
      },
    });
  }

  attempts.push(
    {
      label: "custom-provider/connect (minimal)",
      endpoint: `${API_BASE}/payments/custom-provider/connect`,
      payload: { locationId },
    },
    {
      label: "custom-provider/connect (detailed)",
      endpoint: `${API_BASE}/payments/custom-provider/connect`,
      payload: {
        locationId,
        liveMode,
        name: "Clover by PNC",
        description: "Accept payments via Clover",
      },
    },
    {
      label: "integrations/provider/connect",
      endpoint: `${API_BASE}/payments/integrations/provider/connect`,
      payload: {
        locationId,
        provider: "clover",
        live: liveMode,
      },
    },
    {
      label: "custom-provider/config",
      endpoint: `${API_BASE}/payments/custom-provider/config`,
      payload: {
        locationId,
        name: "Clover by PNC",
        description: "Clover payment processor",
        liveMode,
      },
    },
    {
      label: "custom-provider/connect (text/plain)",
      endpoint: `${API_BASE}/payments/custom-provider/connect`,
      payload: locationId,
      headers: {
        "Content-Type": "text/plain",
      },
    }
  );

  const results = [];

  for (const attempt of attempts) {
    const headers = ghlHeaders(accessToken, {
      "Location-Id": locationId,
      ...(companyId ? { "Company-Id": companyId } : {}),
      ...(attempt.headers || {}),
    });
    try {
      logger?.log?.(`📡 Attempting ${attempt.label}`);
      const response = await axios.post(attempt.endpoint, attempt.payload, { headers });
      results.push({
        label: attempt.label,
        endpoint: attempt.endpoint,
        success: true,
        status: response.status,
        data: response.data,
      });

      if (stopOnSuccess) {
        break;
      }
    } catch (error) {
      const status = error.response?.status;
      const data = error.response?.data;
      logger?.warn?.(`⚠️ ${attempt.label} failed`, { status, data });
      results.push({
        label: attempt.label,
        endpoint: attempt.endpoint,
        success: false,
        status,
        error: data,
      });
    }
  }

  return results;
}

export async function ensureCloverProviderConnection({
  accessToken,
  locationId,
  companyId,
  liveMode = false,
  logger = console,
}) {
  const results = await tryCloverProviderEndpoints(accessToken, locationId, {
    companyId,
    liveMode,
    includeProviderCreation: Boolean(companyId),
    stopOnSuccess: false,
    logger,
  });

  const success = results.some((item) => item.success);
  return { success, results };
}
