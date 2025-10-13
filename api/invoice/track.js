// api/invoice/track.js
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
    const { locationId, invoiceId, amount } = req.body;

    if (!locationId || !invoiceId || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields"
      });
    }

    const normalizedInvoiceId = String(invoiceId).trim().toUpperCase();

    console.log("📝 Tracking invoice:", invoiceId, "Amount:", amount);

    const amountInCents = Math.round(amount * 100);
    const key = `pending_invoice_${amountInCents}`;

    await redis.set(key, JSON.stringify({
      locationId,
      invoiceId,
      amount: amountInCents,
      timestamp: Date.now()
    }), { ex: 3600 }); // 1 hour

    // Also store a direct invoice -> location mapping for note based matching
    const invoiceKey = `invoice_location_${normalizedInvoiceId}`;
    await redis.set(invoiceKey, JSON.stringify({
      locationId,
      invoiceId,
      timestamp: Date.now()
    }), { ex: 86400 * 7 }); // keep for 7 days

    console.log("✅ Invoice tracked");

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("❌ Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}