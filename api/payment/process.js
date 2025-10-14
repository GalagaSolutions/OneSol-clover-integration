import { createCloverCharge } from "../clover/create-charge.js";
import { getLocationToken } from "../utils/getLocationToken.js";
import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      locationId,
      invoiceId,
      amount,
      currency = "usd",
      source,
      customerId,
      customerEmail,
      customerName,
    } = req.body;

    if (!locationId || !amount || !source) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: locationId, amount, or source"
      });
    }

    console.log("💰 Processing payment:");
    console.log("   Location ID:", locationId);
    console.log("   Amount:", amount, currency.toUpperCase());
    console.log("   Invoice ID:", invoiceId);

    const cloverResult = await createCloverCharge({
      amount,
      currency,
      source,
      customerId,
      description: invoiceId ? `GHL Invoice ${invoiceId}` : `Payment from ${customerName || customerEmail}`,
      metadata: {
        locationId,
        invoiceId,
        customerEmail,
        customerName,
        source: "gohighlevel"
      }
    });

    if (!cloverResult.success) {
      return res.status(400).json({
        success: false,
        error: cloverResult.error,
        code: cloverResult.code
      });
    }

    console.log("✅ Payment successful in Clover!");

    let invoiceUpdated = false;
    if (invoiceId) {
      try {
        const accessToken = await getLocationToken(locationId);
        await recordPaymentInGHL(locationId, invoiceId, accessToken, {
          amount,
          transactionId: cloverResult.transactionId,
        });
        console.log("✅ Payment recorded in GHL invoice");
        invoiceUpdated = true;
      } catch (error) {
        console.error("⚠️ Failed to update GHL invoice:", error.message);
        console.error("⚠️ Error details:", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
      }
    }

    return res.status(200).json({
      success: true,
      transactionId: cloverResult.transactionId,
      amount: cloverResult.amount,
      currency: cloverResult.currency,
      status: cloverResult.status,
      card: cloverResult.card,
      message: "Payment processed successfully",
      invoiceUpdated: invoiceUpdated,
      warning: !invoiceUpdated && invoiceId ? "Payment successful but invoice not updated. Check logs for details." : null
    });

  } catch (error) {
    console.error("❌ Payment processing error:", error);
    return res.status(500).json({
      success: false,
      error: "Payment processing failed",
      message: error.message
    });
  }
}

async function recordPaymentInGHL(locationId, invoiceId, accessToken, paymentData) {
  console.log("📝 Recording payment in GHL");
  console.log("   Invoice ID:", invoiceId);
  console.log("   Amount:", paymentData.amount);
  console.log("   Transaction ID:", paymentData.transactionId);
  
  // Use the Invoice record-payment endpoint
  const invoiceUrl = `https://services.leadconnectorhq.com/invoices/${invoiceId}/record-payment`;
  
  const payload = {
    amount: paymentData.amount,
    paymentMode: "custom",
    transactionId: paymentData.transactionId,
    notes: `Payment processed via Clover - Transaction: ${paymentData.transactionId}`
  };
  
  console.log("📤 Payment payload:", JSON.stringify(payload, null, 2));
  
  const response = await axios.post(invoiceUrl, payload, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
  });
  
  console.log("✅ Payment recorded in GHL");
  console.log("   Response:", JSON.stringify(response.data));
}