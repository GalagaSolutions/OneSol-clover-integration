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
    const { locationId, invoiceId, amount, customerName, customerEmail, invoiceNumber } = req.body;

    if (!locationId || !invoiceId || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields"
      });
    }

    console.log("📝 Tracking invoice:", invoiceId, "Amount:", amount);

    // Store by both amount and invoice number for reliable matching
    const amountInCents = Math.round(amount * 100);
    
    // Create a compound key that includes location for multiple merchant support
    const amountKey = `pending_invoice_amount_${locationId}_${amountInCents}`;
    const invoiceKey = `pending_invoice_number_${locationId}_${invoiceNumber}`;
    
    const invoiceData = {
      locationId,
      invoiceId,
      invoiceNumber,
      amount: amountInCents,
      customerName,
      customerEmail,
      timestamp: Date.now()
    };
    
    // Store invoice data with both keys for 24 hours
    await redis.set(amountKey, JSON.stringify(invoiceData), { ex: 86400 });
    await redis.set(invoiceKey, JSON.stringify(invoiceData), { ex: 86400 }); // 24 hours

    console.log("✅ Invoice tracked");

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("❌ Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}