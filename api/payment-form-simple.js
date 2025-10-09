// api/payment-form-simple.js
export default function handler(req, res) {
  const { 
    amount = '0.00', 
    invoiceId = '', 
    locationId = '', 
    customerEmail = '', 
    customerName = '' 
  } = req.query;
  
  // Prefer PAKMS key for frontend, fallback to Merchant ID
  const pakmsKey = process.env.CLOVER_PAKMS_KEY;
  const merchantId = process.env.CLOVER_MERCHANT_ID || 'RCTSTAVI0010002';
  const cloverKey = pakmsKey || merchantId;

  let invoiceInfoHTML = '';
  if (invoiceId || customerName || customerEmail) {
    invoiceInfoHTML = `<div class="invoice-info">
      ${invoiceId ? `<div><strong>Invoice:</strong> ${invoiceId}</div>` : ''}
      ${customerName ? `<div><strong>Customer:</strong> ${customerName}</div>` : ''}
      ${customerEmail ? `<div><strong>Email:</strong> ${customerEmail}</div>` : ''}
    </div>`;
  }

  const html = `<!DOCTYPE html>
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
        .invoice-info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 30px; font-size: 14px; color: #666; }
        .invoice-info div { margin-bottom: 5px; }
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
            🔧 Using: ${pakmsKey ? 'PAKMS Key (' + pakmsKey.substring(0, 10) + '...)' : 'Merchant ID (' + merchantId.substring(0, 8) + '...)'}
        </div>
        
        <h1>Complete Payment</h1>
        <div class="amount">$${amount}</div>
        
        ${invoiceInfoHTML}
        
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
            
            <button type="submit" id="payButton" class="btn-pay">Pay $${amount}</button>
            <div id="message" class="message"></div>
            <div id="debug" class="debug"></div>
        </form>
        
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
            🔒 Secure payment powered by Clover
        </div>
    </div>
    
    <script>
        const paymentData = {
            locationId: '${locationId}',
            invoiceId: '${invoiceId}',
            amount: parseFloat('${amount}'),
            customerEmail: '${customerEmail}',
            customerName: '${customerName}'
        };
        const cloverKey = '${cloverKey}';
        
        let logs = [];
        function log(msg, data) {
            const entry = new Date().toLocaleTimeString() + ' - ' + msg + (data ? ': ' + JSON.stringify(data).substring(0, 100) : '');
            console.log(msg, data || '');
            logs.push(entry);
            document.getElementById('debug').textContent = logs.join('\\n');
        }
        
        log('🔧 Initializing', { key: cloverKey.substring(0, 10) + '...', amount: paymentData.amount });
        
        if (!paymentData.locationId) {
            document.getElementById('message').className = 'message error';
            document.getElementById('message').textContent = '❌ Missing locationId parameter';
            document.getElementById('message').style.display = 'block';
            document.getElementById('payButton').disabled = true;
        }
        
        let clover, elements, cardNumber, cardDate, cardCvv, cardPostalCode;
        
        window.addEventListener('load', function() {
            setTimeout(function() {
                try {
                    if (typeof Clover === 'undefined') {
                        throw new Error('Clover SDK not loaded');
                    }
                    
                    log('✅ Clover SDK loaded');
                    
                    clover = new Clover(cloverKey);
                    elements = clover.elements();
                    
                    log('✅ Clover initialized');
                    
                    const styles = {
                        body: { fontFamily: 'Arial, sans-serif', fontSize: '16px' },
                        input: { fontSize: '16px', padding: '10px' }
                    };
                    
                    cardNumber = elements.create('CARD_NUMBER', styles);
                    cardDate = elements.create('CARD_DATE', styles);
                    cardCvv = elements.create('CARD_CVV', styles);
                    cardPostalCode = elements.create('CARD_POSTAL_CODE', styles);
                    
                    cardNumber.mount('#card-number');
                    cardDate.mount('#card-date');
                    cardCvv.mount('#card-cvv');
                    cardPostalCode.mount('#card-postal-code');
                    
                    log('✅ Elements mounted');
                    
                    cardNumber.addEventListener('change', e => log('Card field updated'));
                    
                } catch (error) {
                    log('❌ Init error', error.message);
                    document.getElementById('message').className = 'message error';
                    document.getElementById('message').textContent = '❌ ' + error.message;
                    document.getElementById('message').style.display = 'block';
                    document.getElementById('payButton').disabled = true;
                }
            }, 800);
        });
        
        document.getElementById('paymentForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            log('🔄 Submitting payment');
            
            const btn = document.getElementById('payButton');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Processing...';
            document.getElementById('message').style.display = 'none';
            
            try {
                if (!clover) throw new Error('Clover not initialized');
                
                log('🔄 Creating token...');
                const result = await clover.createToken();
                
                log('Token response', result);
                
                if (result.errors?.length > 0) {
                    throw new Error(result.errors[0].message || 'Validation failed');
                }
                
                const token = result.token || result.id;
                if (!token) {
                    log('❌ No token', result);
                    throw new Error('No payment token received. Check console for details.');
                }
                
                log('✅ Token created', token.substring(0, 15) + '...');
                
                const payload = {
                    locationId: paymentData.locationId,
                    amount: paymentData.amount,
                    currency: 'usd',
                    source: token,
                    invoiceId: paymentData.invoiceId,
                    customerEmail: paymentData.customerEmail,
                    customerName: paymentData.customerName
                };
                
                log('🔄 Sending to backend');
                
                const response = await fetch('/api/payment/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const paymentResult = await response.json();
                log('Backend response', paymentResult);
                
                if (paymentResult.success) {
                    document.getElementById('message').className = 'message success';
                    document.getElementById('message').innerHTML = 
                        '✅ <strong>Payment Successful!</strong><br>' +
                        'Transaction: ' + paymentResult.transactionId + '<br>' +
                        'Amount: $' + paymentResult.amount;
                    document.getElementById('message').style.display = 'block';
                    log('✅ Payment successful');
                } else {
                    throw new Error(paymentResult.error || 'Payment failed');
                }
                
            } catch (error) {
                log('❌ Error', error.message);
                document.getElementById('message').className = 'message error';
                document.getElementById('message').textContent = '❌ ' + error.message;
                document.getElementById('message').style.display = 'block';
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}