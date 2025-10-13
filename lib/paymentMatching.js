import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

/**
 * Match a Clover payment to a GHL invoice
 */
export async function matchPaymentToInvoice(payment, merchantId) {
  try {
    // Get location ID from merchant mapping
    const merchantKey = `merchant_${merchantId}`;
    const merchantData = await redis.get(merchantKey);
    
    if (!merchantData) {
      console.error("❌ No location found for merchant:", merchantId);
      return null;
    }

    const { locationId } = JSON.parse(merchantData);

    // Try to match by invoice number first (from payment note or order ID)
    let invoiceNumber = extractInvoiceNumber(payment.note) || 
                       extractInvoiceNumber(payment.order?.note) ||
                       payment.order?.id;

    if (invoiceNumber) {
      const invoiceKey = `pending_invoice_number_${locationId}_${invoiceNumber}`;
      const invoiceData = await redis.get(invoiceKey);
      
      if (invoiceData) {
        return JSON.parse(invoiceData);
      }
    }

    // If no match by invoice number, try matching by amount
    const amountKey = `pending_invoice_amount_${locationId}_${payment.amount}`;
    const invoiceData = await redis.get(amountKey);
    
    if (invoiceData) {
      return JSON.parse(invoiceData);
    }

    return null;
  } catch (error) {
    console.error("❌ Error matching payment:", error);
    return null;
  }
}

/**
 * Store unmatched payment for later processing
 */
export async function storeUnmatchedPayment(payment, merchantId) {
  const key = `unmatched_payment_${payment.id}`;
  await redis.set(key, JSON.stringify({
    payment,
    merchantId,
    timestamp: Date.now()
  }), { ex: 86400 }); // Store for 24 hours
}

/**
 * Extract invoice number from text
 */
function extractInvoiceNumber(text) {
  if (!text) return null;
  
  // Look for common invoice number patterns
  const patterns = [
    /(?:Invoice|INV)[:#\s-]*(\d+)/i,
    /GHL[:#\s-]*(\d+)/i,
    /#(\d+)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  return null;
}