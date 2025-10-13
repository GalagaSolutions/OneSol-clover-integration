// api/utils/ghlInvoiceUpdate.js
import axios from 'axios';

export async function recordPaymentInGHL(locationId, invoiceId, accessToken, paymentData) {
  const { amount, transactionId } = paymentData;
  
  // Add detailed payment information for POS transactions
  const response = await axios.post(
    `https://services.gohighlevel.com/v2/locations/${locationId}/payments/custom`,
    {
      invoiceId,
      amount: amount,
      transactionId: transactionId,
      provider: "Clover POS",
      status: "succeeded",
      paymentMethod: "pos_payment",
      metadata: {
        cloverPaymentId: transactionId,
        paymentType: "pos_device",
        processedAt: new Date().toISOString(),
        deviceType: "clover_pos"
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      }
    }
  );

  if (response.status !== 200) {
    throw new Error(`Failed to record payment: ${response.statusText}`);
  }

  return response.data;
}