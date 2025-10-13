// api/webhooks/clover.js
import { getLocationToken } from "../../lib/getLocationToken.js";
import axios from "axios";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("🔔 Webhook received from Clover");
    console.log("📦 Payload:", JSON.stringify(req.body, null, 2));

    const { type, merchantId, objectId } = req.body;

    // Only process payment events
    if (type !== "PAYMENT_CREATED" && type !== "CREATE") {
      console.log("ℹ️ Ignoring event type:", type);
      return res.status(200).json({ received: true });
    }

    console.log("💳 Payment event detected!");
    console.log("   Merchant ID:", merchantId);
    console.log("   Payment ID:", objectId);

    // Get payment details from Clover
    const payment = await getCloverPayment(merchantId, objectId);
    
    if (!payment) {
      console.error("❌ Could not retrieve payment");
      return res.status(200).json({ received: true });
    }

    console.log("✅ Payment details:", {
      id: payment.id,
      amount: payment.amount / 100,
      note: payment.note
    });

    // Try to match payment to invoice
    const match = await matchPaymentToInvoice(payment);

    if (!match) {
      console.log("⚠️ No matching invoice found");
      await storeUnmatchedPayment(payment);
      return res.status(200).json({ 
        received: true, 
        matched: false 
      });
    }

    console.log("🎯 Matched to invoice:", match.invoiceId);

    // Update GHL invoice
    await updateGHLInvoice(match.locationId, match.invoiceId, {
      amount: payment.amount / 100,
      transactionId: payment.id
    });

    console.log("✅ Invoice updated!");

    return res.status(200).json({
      received: true,
      matched: true,
      invoiceId: match.invoiceId
    });

  } catch (error) {
    console.error("❌ Webhook error:", error);
    return res.status(200).json({ received: true, error: error.message });
  }
}

async function getCloverPayment(merchantId, paymentId) {
  const apiToken = process.env.CLOVER_API_TOKEN;
  const isProduction = process.env.CLOVER_ENVIRONMENT === "production";
  
  const baseUrl = isProduction 
    ? "https://api.clover.com"
    : "https://sandbox.dev.clover.com";

  try {
    const url = `${baseUrl}/v3/merchants/${merchantId}/payments/${paymentId}`;
    
    const response = await axios.get(url, {
      headers: { "Authorization": `Bearer ${apiToken}` }
    });

    return response.data;
  } catch (error) {
    console.error("Failed to get payment:", error.message);
    return null;
  }
}

async function matchPaymentToInvoice(payment) {
  // Strategy 1: Check payment note for invoice ID
  const noteInvoice = extractInvoiceIdFromNote(payment.note);
  if (noteInvoice) {
    console.log("🧾 Invoice reference detected in Clover note:", noteInvoice);
    const locationData = await findLocationForInvoice(noteInvoice);

    if (locationData?.locationId) {
      return {
        locationId: locationData.locationId,
        invoiceId: locationData.invoiceId || noteInvoice
      };
    }
  }

  // Strategy 2: Match by amount and recent time
  const amountInCents = payment.amount;
  const key = `pending_invoice_${amountInCents}`;
  const match = await redis.get(key);
  
  if (match) {
    const data = typeof match === 'string' ? JSON.parse(match) : match;
    
    // Check if within 10 minutes
    const timeDiff = Date.now() - data.timestamp;
    if (timeDiff < 10 * 60 * 1000) {
      await redis.del(key);
      return {
        locationId: data.locationId,
        invoiceId: data.invoiceId
      };
    }
  }

  return null;
}

function normalizeInvoiceId(invoiceId) {
  return String(invoiceId || "").trim().toUpperCase();
}

function extractInvoiceIdFromNote(note = "") {
  if (!note) return null;

  const text = note.trim();

  // Direct matches for known prefixes (INV-, TEST-, etc)
  const invMatch = text.match(/\bINV-[A-Z0-9_-]+\b/i);
  if (invMatch) {
    return normalizeInvoiceId(invMatch[0]);
  }

  const testMatch = text.match(/\bTEST-[A-Z0-9_-]+\b/i);
  if (testMatch) {
    return normalizeInvoiceId(testMatch[0]);
  }

  const invoiceLabelMatch = text.match(/\bINVOICE[\s#:-]*([A-Z0-9_-]+)/i);
  if (invoiceLabelMatch) {
    return normalizeInvoiceId(invoiceLabelMatch[1]);
  }

  // Look for standalone alphanumeric strings with at least 4 characters
  const genericMatch = text.match(/\b[A-Z0-9_-]{4,}\b/i);
  if (genericMatch) {
    return normalizeInvoiceId(genericMatch[0]);
  }

  return null;
}

async function findLocationForInvoice(invoiceId) {
  const normalized = normalizeInvoiceId(invoiceId);

  if (!normalized) {
    return null;
  }

  const invoiceKey = `invoice_location_${normalized}`;
  const cached = await redis.get(invoiceKey);

  if (cached) {
    const data = typeof cached === "string" ? JSON.parse(cached) : cached;
    return {
      locationId: data.locationId,
      invoiceId: data.invoiceId || invoiceId
    };
  }

  return null;
}

async function storeUnmatchedPayment(payment) {
  const key = `unmatched_payment_${payment.id}`;
  await redis.set(key, JSON.stringify({
    paymentId: payment.id,
    amount: payment.amount / 100,
    timestamp: Date.now(),
    note: payment.note
  }), { ex: 86400 * 7 }); // 7 days
}

async function updateGHLInvoice(locationId, invoiceId, paymentData) {
  if (!locationId) {
    throw new Error("Missing locationId for invoice update");
  }

  const accessToken = await getLocationToken(locationId);

  const url = `https://services.leadconnectorhq.com/v2/locations/${locationId}/invoices/${invoiceId}/record-payment`;

  await axios.post(url, {
    amount: paymentData.amount,
    paymentMode: "custom",
    transactionId: paymentData.transactionId,
    notes: "Payment via Clover device"
  }, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
      "Location-Id": locationId
    }
  });
}
