import { Redis } from "@upstash/redis";
import { getCloverCharge } from "../clover/create-charge.js";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  // GHL calls this endpoint with POST for payment verification
  if (req.method === "POST") {
    return await handleGHLQuery(req, res);
  }

  // GET requests for debugging/admin purposes
  if (req.method === "GET") {
    return await handleDebugQuery(req, res);
  }

  return res.status(405).json({ error: "Method not allowed" });
}

// THIS IS THE CRITICAL FUNCTION - GHL calls this to verify payments!
async function handleGHLQuery(req, res) {
  try {
    const { type, apiKey, chargeId, transactionId, locationId } = req.body;
    
    console.log("🔔 GHL Query URL called");
    console.log("   Type:", type);
    console.log("   Charge ID:", chargeId);
    console.log("   Transaction ID:", transactionId);
    console.log("   Location ID:", locationId);

    // Validate API key
    if (!apiKey) {
      console.error("❌ Missing API key");
      return res.status(401).json({ error: "Missing API key" });
    }

    // Verify API key matches this location
    const keysData = await redis.get(`clover_keys_${locationId}`);
    if (!keysData) {
      console.error("❌ No keys found for location:", locationId);
      return res.status(401).json({ error: "Invalid location" });
    }

    const keys = typeof keysData === 'string' ? JSON.parse(keysData) : keysData;
    if (keys.apiKey !== apiKey) {
      console.error("❌ API key mismatch");
      return res.status(401).json({ error: "Invalid API key" });
    }

    console.log("✅ API key validated");

    // Handle different query types
    switch (type) {
      case "verify":
        return await handleVerify(req, res, chargeId || transactionId);
      
      case "list_payment_methods":
        return await handleListPaymentMethods(req, res);
      
      case "charge_payment":
        return await handleChargePayment(req, res);
      
      case "refund":
        return await handleRefund(req, res, chargeId || transactionId);
      
      default:
        console.log("⚠️ Unknown query type:", type);
        return res.status(400).json({ error: "Unknown query type" });
    }

  } catch (error) {
    console.error("❌ Query handler error:", error);
    return res.status(500).json({ error: error.message });
  }
}

async function handleVerify(req, res, chargeId) {
  console.log("🔍 Verifying charge:", chargeId);
  
  if (!chargeId) {
    console.error("❌ No chargeId provided");
    return res.json({ success: false, error: "Missing chargeId" });
  }

  try {
    // Verify with Clover that this charge succeeded
    const cloverCharge = await getCloverCharge(chargeId);
    
    if (!cloverCharge.success) {
      console.error("❌ Failed to get charge from Clover");
      return res.json({ 
        success: false,
        error: "Could not verify charge"
      });
    }

    console.log("📋 Charge status:", cloverCharge.charge.status);
    
    if (cloverCharge.charge.status === "succeeded") {
      console.log("✅ Charge verified successfully - GHL will mark invoice as PAID");
      
      // THIS is what makes GHL mark the invoice as paid!
      return res.json({ 
        success: true,
        charge: {
          id: cloverCharge.charge.id,
          amount: cloverCharge.charge.amount / 100,
          status: cloverCharge.charge.status,
          created: cloverCharge.charge.created
        }
      });
    }
    
    if (cloverCharge.charge.status === "pending") {
      console.log("⏳ Charge is pending");
      return res.json({ 
        success: false,
        pending: true
      });
    }

    console.log("❌ Charge failed or was declined");
    return res.json({ 
      success: false,
      error: "Charge not successful"
    });
    
  } catch (error) {
    console.error("❌ Verification error:", error);
    return res.json({ 
      success: false,
      error: error.message
    });
  }
}

async function handleListPaymentMethods(req, res) {
  console.log("📋 Listing payment methods");
  // Return empty array for now (not supporting saved cards yet)
  return res.json([]);
}

async function handleChargePayment(req, res) {
  console.log("💳 Charge payment requested");
  // Not implemented yet - payment form handles this
  return res.status(501).json({ error: "Not implemented - use payment form" });
}

async function handleRefund(req, res, chargeId) {
  console.log("💸 Refund requested for:", chargeId);
  // Not implemented yet
  return res.status(501).json({ error: "Refunds not yet implemented" });
}

// Debug/admin GET requests
async function handleDebugQuery(req, res) {
  const { type, paymentId, amount, locationId } = req.query;

  try {
    // Query unmatched payment by ID
    if (type === "unmatched" && paymentId) {
      return await getUnmatchedPayment(paymentId, res);
    }

    // Query pending invoice by amount
    if (type === "pending" && amount) {
      return await getPendingInvoice(amount, res);
    }

    // Check API keys for a location
    if (type === "keys" && locationId) {
      return await getLocationKeys(locationId, res);
    }

    // Default: show usage
    return res.status(200).json({
      message: "Payment Query API - Debug Mode",
      note: "POST requests are for GHL integration, GET requests are for debugging",
      debugUsage: {
        unmatched: "?type=unmatched&paymentId=XXX",
        pending: "?type=pending&amount=100.00",
        keys: "?type=keys&locationId=XXX"
      },
      ghlUsage: {
        verify: "POST with {type: 'verify', apiKey, chargeId}",
        list: "POST with {type: 'list_payment_methods', apiKey}",
        refund: "POST with {type: 'refund', apiKey, chargeId}"
      }
    });

  } catch (error) {
    console.error("❌ Debug query error:", error);
    return res.status(500).json({
      error: "Query failed",
      message: error.message
    });
  }
}

async function getUnmatchedPayment(paymentId, res) {
  const key = `unmatched_payment_${paymentId}`;
  const payment = await redis.get(key);
  
  if (!payment) {
    return res.status(404).json({
      found: false,
      paymentId,
      message: "No unmatched payment found"
    });
  }

  const data = typeof payment === 'string' ? JSON.parse(payment) : payment;
  
  return res.status(200).json({
    found: true,
    payment: {
      paymentId: data.paymentId,
      amount: data.amount,
      timestamp: new Date(data.timestamp).toISOString(),
      note: data.note,
      ageMinutes: Math.floor((Date.now() - data.timestamp) / 60000)
    }
  });
}

async function getPendingInvoice(amount, res) {
  const amountInCents = Math.round(parseFloat(amount) * 100);
  const key = `pending_invoice_${amountInCents}`;
  const invoice = await redis.get(key);
  
  if (!invoice) {
    return res.status(404).json({
      found: false,
      amount: parseFloat(amount),
      message: "No pending invoice found"
    });
  }

  const data = typeof invoice === 'string' ? JSON.parse(invoice) : invoice;
  const ageMinutes = Math.floor((Date.now() - data.timestamp) / 60000);
  const isExpired = ageMinutes > 10;
  
  return res.status(200).json({
    found: true,
    expired: isExpired,
    invoice: {
      locationId: data.locationId,
      invoiceId: data.invoiceId,
      amount: data.amount / 100,
      timestamp: new Date(data.timestamp).toISOString(),
      ageMinutes
    }
  });
}

async function getLocationKeys(locationId, res) {
  const keysData = await redis.get(`clover_keys_${locationId}`);
  
  if (!keysData) {
    return res.status(404).json({
      found: false,
      locationId,
      message: "No keys found for this location"
    });
  }

  const keys = typeof keysData === 'string' ? JSON.parse(keysData) : keysData;
  
  return res.status(200).json({
    found: true,
    locationId,
    hasApiKey: !!keys.apiKey,
    hasPublishableKey: !!keys.publishableKey,
    apiKeyPreview: keys.apiKey ? keys.apiKey.substring(0, 8) + "..." : null,
    createdAt: keys.createdAt
  });
}