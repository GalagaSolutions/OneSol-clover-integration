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
      warning: !invoiceUpdated && invoiceId ? "Payment successful but invoice not updated. This may be a permissions issue." : null
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
  
  // Try method 1: Direct invoice record-payment endpoint
  const invoiceUrl = `https://services.leadconnectorhq.com/invoices/${invoiceId}/record-payment`;
  
  const payload = {
    amount: paymentData.amount,
    paymentMode: "custom",
    transactionId: paymentData.transactionId,
    notes: `Payment processed via Clover - Transaction: ${paymentData.transactionId}`
  };
  
  console.log("📤 Attempting Method 1: Invoice record-payment endpoint");
  console.log("   URL:", invoiceUrl);
  console.log("   Payload:", JSON.stringify(payload, null, 2));
  
  try {
    const response = await axios.post(invoiceUrl, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
    });
    
    console.log("✅ Payment recorded in GHL (Method 1)");
    console.log("   Response:", JSON.stringify(response.data));
    return;
    
  } catch (error) {
    console.log("❌ Method 1 failed:", error.response?.status, error.response?.data?.message);
    
    // Try method 2: Using the v2 API
    console.log("📤 Attempting Method 2: V2 Invoices API");
    
    const v2Url = `https://services.leadconnectorhq.com/invoices/schedule/${invoiceId}/record-manual-payment`;
    
    try {
      const response2 = await axios.post(v2Url, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
      });
      
      console.log("✅ Payment recorded in GHL (Method 2)");
      console.log("   Response:", JSON.stringify(response2.data));
      return;
      
    } catch (error2) {
      console.log("❌ Method 2 failed:", error2.response?.status, error2.response?.data?.message);
      
      // Try method 3: Text endpoint
      console.log("📤 Attempting Method 3: Text-based endpoint");
      
      const textPayload = {
        amount: paymentData.amount,
        paymentMethod: "custom",
        externalTransactionId: paymentData.transactionId,
        note: `Payment via Clover - ${paymentData.transactionId}`
      };
      
      try {
        const response3 = await axios.post(invoiceUrl, textPayload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Version: "2021-07-28",
          },
        });
        
        console.log("✅ Payment recorded in GHL (Method 3)");
        console.log("   Response:", JSON.stringify(response3.data));
        return;
        
      } catch (error3) {
        console.error("❌ All methods failed");
        console.error("   Method 1 error:", error.response?.data);
        console.error("   Method 2 error:", error2.response?.data);
        console.error("   Method 3 error:", error3.response?.data);
        throw error; // Throw original error
      }
    }
  }
}