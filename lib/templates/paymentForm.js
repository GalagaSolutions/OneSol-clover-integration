import { escapeHtml } from "../utils/escapeHtml.js";

function formatMaskedValue(label, value) {
  if (!value) {
    return `${label}: NOT SET`;
  }

  return `${label}: ${value.substring(0, 10)}...`;
}

function buildInvoiceSummary({ invoiceId, customerName, customerEmail }) {
  const rows = [];

  if (invoiceId) {
    rows.push(`<div><strong>Invoice:</strong> ${escapeHtml(invoiceId)}</div>`);
  }

  if (customerName) {
    rows.push(`<div><strong>Customer:</strong> ${escapeHtml(customerName)}</div>`);
  }

  if (customerEmail) {
    rows.push(`<div><strong>Email:</strong> ${escapeHtml(customerEmail)}</div>`);
  }

  if (!rows.length) {
    return "";
  }

  return `<div class="invoice-info">${rows.join("")}</div>`;
}

function buildDeviceInstruction(invoiceId) {
  if (!invoiceId) {
    return "";
  }

  const escapedInvoice = escapeHtml(invoiceId);
  return `<div class="device-instruction">
    <div class="device-instruction-title">Using a Clover Device?</div>
    <div>Enter <strong>${escapedInvoice}</strong> in the Clover payment <em>Note</em> so we can match this swipe to the GoHighLevel invoice automatically.</div>
  </div>`;
}

export function renderPaymentFormPage({
  amount = "0.00",
  invoiceId = "",
  locationId = "",
  customerEmail = "",
  customerName = "",
  pakmsKey = "",
  merchantId = "",
  cloverKey = "",
}) {
  const normalizedAmount = typeof amount === "number" ? amount.toFixed(2) : amount;
  const invoiceSummary = buildInvoiceSummary({ invoiceId, customerName, customerEmail });
  const deviceInstruction = buildDeviceInstruction(invoiceId);
  const paymentDataScript = JSON.stringify({
    locationId,
    invoiceId,
    amount: Number.parseFloat(normalizedAmount) || 0,
    customerEmail,
    customerName,
  });

  const maskedKey = pakmsKey ? formatMaskedValue("PAKMS Key", pakmsKey) : formatMaskedValue("Merchant ID", merchantId);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment</title>
  <script src="https://checkout.sandbox.dev.clover.com/sdk.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .payment-container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 450px;
      width: 100%;
      padding: 40px;
    }
    h1 { text-align: center; color: #333; margin-bottom: 8px; font-size: 24px; }
    .amount { text-align: center; font-size: 36px; font-weight: 700; color: #667eea; margin-bottom: 30px; }
    .invoice-info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; color: #666; }
    .invoice-info div { margin-bottom: 5px; }
    .device-instruction { background: #fff7e6; border: 1px solid #ffe0a3; color: #9a6b00; padding: 14px; border-radius: 8px; font-size: 13px; margin-bottom: 30px; line-height: 1.5; }
    .device-instruction-title { font-weight: 600; margin-bottom: 6px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; color: #333; font-weight: 500; font-size: 14px; }
    .clover-input {
      width: 100%;
      padding: 14px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.3s;
      background: white;
      min-height: 50px;
    }
    .card-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .btn-pay {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
      margin-top: 10px;
    }
    .btn-pay:hover:not(:disabled) { transform: translateY(-2px); }
    .btn-pay:disabled { background: #ccc; cursor: not-allowed; }
    .message { padding: 15px; border-radius: 8px; margin-top: 20px; display: none; font-size: 14px; }
    .message.success { background: #d4edda; color: #155724; }
    .message.error { background: #f8d7da; color: #721c24; }
    .spinner {
      display: inline-block;
      width: 18px;
      height: 18px;
      border: 3px solid rgba(255,255,255,.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 1s ease-in-out infinite;
      margin-right: 10px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .debug { margin-top: 15px; padding: 10px; background: #f0f0f0; border-radius: 4px; font-size: 11px; font-family: monospace; max-height: 150px; overflow-y: auto; }
    .merchant-badge { text-align: center; margin-bottom: 20px; padding: 10px; background: #e8f4f8; border-radius: 6px; font-size: 12px; color: #0066cc; }
  </style>
</head>
<body>
  <div class="payment-container">
    <div class="merchant-badge">
      🔧 Using: ${escapeHtml(maskedKey)}
    </div>

    <h1>Complete Payment</h1>
    <div class="amount">$${escapeHtml(normalizedAmount)}</div>

    ${invoiceSummary}
    ${deviceInstruction}

    <form id="paymentForm">
      <div class="form-group">
        <label>Card Number</label>
        <div id="card-number" class="clover-input"></div>
      </div>

      <div class="card-row">
        <div class="form-group">
          <label>Expiry Date</label>
          <div id="card-date" class="clover-input"></div>
        </div>
        <div class="form-group">
          <label>CVV</label>
          <div id="card-cvv" class="clover-input"></div>
        </div>
      </div>

      <div class="form-group">
        <label>ZIP Code</label>
        <div id="card-postal-code" class="clover-input"></div>
      </div>

      <button type="submit" id="payButton" class="btn-pay">Pay $${escapeHtml(normalizedAmount)}</button>
      <div id="message" class="message"></div>
      <div id="debug" class="debug"></div>
    </form>

    <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
      🔒 Secure payment powered by Clover
    </div>
  </div>

  <script>
    const paymentData = ${paymentDataScript};
    const cloverKey = ${JSON.stringify(cloverKey || "")};

    if (paymentData.invoiceId && paymentData.amount > 0) {
      fetch('/api/invoice/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: paymentData.locationId,
          invoiceId: paymentData.invoiceId,
          amount: paymentData.amount
        })
      }).then(() => console.log('📝 Invoice tracked for matching'))
        .catch(err => console.log('⚠️ Could not track invoice:', err));
    }

    let logs = [];
    function log(msg, data) {
      const entry = new Date().toLocaleTimeString() + ' - ' + msg + (data ? ': ' + JSON.stringify(data).substring(0, 100) : '');
      console.log(msg, data || '');
      logs.push(entry);
      document.getElementById('debug').textContent = logs.join('\n');
    }

    log('🔧 Initializing', { key: cloverKey ? cloverKey.substring(0, 10) + '...' : 'missing', amount: paymentData.amount });

    if (!paymentData.locationId) {
      document.getElementById('message').className = 'message error';
      document.getElementById('message').textContent = '❌ Missing locationId parameter';
      document.getElementById('message').style.display = 'block';
      document.getElementById('payButton').disabled = true;
    }

    let clover, elements, cardNumber;

    window.addEventListener('load', function() {
      setTimeout(function() {
        try {
          clover = new Clover(cloverKey);
          elements = clover.elements();

          cardNumber = elements.create('CARD_NUMBER');
          cardNumber.mount('#card-number');

          const cardDate = elements.create('CARD_DATE');
          cardDate.mount('#card-date');

          const cardCvv = elements.create('CARD_CVV');
          cardCvv.mount('#card-cvv');

          const cardPostalCode = elements.create('CARD_POSTAL_CODE');
          cardPostalCode.mount('#card-postal-code');

          log('✅ Clover elements mounted');
        } catch (err) {
          log('❌ Failed to initialize Clover SDK', err.message);
          document.getElementById('message').className = 'message error';
          document.getElementById('message').textContent = '❌ Failed to load Clover payment fields';
          document.getElementById('message').style.display = 'block';
          document.getElementById('payButton').disabled = true;
        }
      }, 400);
    });

    const form = document.getElementById('paymentForm');
    const messageEl = document.getElementById('message');
    const payButton = document.getElementById('payButton');

    form.addEventListener('submit', async function(event) {
      event.preventDefault();

      if (!clover) {
        log('❌ Clover SDK not ready');
        return;
      }

      payButton.disabled = true;
      payButton.innerHTML = '<span class="spinner"></span>Processing...';
      messageEl.style.display = 'none';

      try {
        log('🔄 Creating token');
        const result = await clover.createToken(cardNumber);

        if (!result?.token) {
          throw new Error(result?.errors?.[0]?.message || 'Tokenization failed');
        }

        log('✅ Token created', { token: result.token.substring(0, 12) + '...' });

        const response = await fetch('/api/payment/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...paymentData,
            source: result.token,
            customerEmail: paymentData.customerEmail,
            customerName: paymentData.customerName
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Payment failed');
        }

        messageEl.className = 'message success';
        messageEl.textContent = '✅ Payment successful!';
        messageEl.style.display = 'block';
        payButton.innerHTML = 'Paid';
        log('✅ Payment succeeded', data);

      } catch (err) {
        console.error(err);
        log('❌ Payment failed', err.message);
        messageEl.className = 'message error';
        messageEl.textContent = '❌ ' + (err.message || 'Payment failed');
        messageEl.style.display = 'block';
        payButton.disabled = false;
        payButton.innerHTML = 'Pay $${escapeHtml(normalizedAmount)}';
      }
    });
  </script>
</body>
</html>`;
}
