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
          customerEmail,
          customerName,
        });
        console.log("✅ Payment recorded in GHL");
        invoiceUpdated = true;
      } catch (error) {
        console.error("⚠️ Failed to update GHL:", error.message);
        console.error("⚠️ Error details:", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          requestUrl: error.config?.url
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
      warning: !invoiceUpdated && invoiceId ? "Payment successful. Invoice update may require manual verification." : null
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
  console.log("📝 Recording payment in GHL using Custom Provider API");
  console.log("   Location ID:", locationId);
  console.log("   Invoice ID:", invoiceId);
  console.log("   Amount:", paymentData.amount);
  console.log("   Transaction ID:", paymentData.transactionId);
  
  // Use the Custom Provider Payment API
  const customProviderUrl = "https://services.leadconnectorhq.com/payments/custom-provider/record";
  
  const payload = {
    locationId: locationId,
    invoiceId: invoiceId,
    amount: Math.round(paymentData.amount * 100), // Convert to cents
    currency: "usd",
    transactionId: paymentData.transactionId,
    paymentMode: "live",
    status: "succeeded",
    provider: "clover",
    metadata: {
      customerEmail: paymentData.customerEmail,
      customerName: paymentData.customerName,
      processor: "clover",
      source: "custom_payment_form"
    }
  };
  
  console.log("📤 Custom Provider API Request");
  console.log("   URL:", customProviderUrl);
  console.log("   Payload:", JSON.stringify(payload, null, 2));
  
  try {
    const response = await axios.post(customProviderUrl, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
    });
    
    console.log("✅ Payment recorded via Custom Provider API");
    console.log("   Response:", JSON.stringify(response.data));
    return;
    
  } catch (error) {
    console.error("❌ Custom Provider API failed:", error.response?.status, error.response?.data);
    
    // If custom provider fails, try the basic payments/orders endpoint
    console.log("📤 Attempting fallback: Payments Orders API");
    
    const ordersUrl = "https://services.leadconnectorhq.com/payments/orders";
    
    const ordersPayload = {
      locationId: locationId,
      amount: Math.round(paymentData.amount * 100),
      currency: "usd",
      status: "succeeded",
      externalTransactionId: paymentData.transactionId,
      transactionType: "charge",
      paymentMode: "live",
      invoiceId: invoiceId,
      metadata: {
        provider: "clover",
        processor: "clover_integration"
      }
    };
    
    try {
      const response2 = await axios.post(ordersUrl, ordersPayload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
      });
      
      console.log("✅ Payment recorded via Orders API");
      console.log("   Response:", JSON.stringify(response2.data));
      
    } catch (error2) {
      console.error("❌ Orders API also failed:", error2.response?.status, error2.response?.data);
      throw error; // Throw original error
    }
  }
}