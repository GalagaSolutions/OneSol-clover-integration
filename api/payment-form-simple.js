export default function handler(req, res) {
  const { 
    amount = '', 
    invoiceId = '', 
    locationId = '', 
    customerEmail = '', 
    customerName = '' 
  } = req.query;
  
  const pakmsKey = process.env.CLOVER_PAKMS_KEY;
  const merchantId = process.env.CLOVER_MERCHANT_ID || 'RCTSTAVI0010002';
  const cloverKey = pakmsKey || merchantId;

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
        .loading {
            text-align: center;
            padding: 40px;
            color: #667eea;
            font-size: 18px;
        }
        .spinner-large {
            display: inline-block;
            width: 40px;
            height: 40px;
            border: 4px solid rgba(102, 126, 234, 0.3);
            border-radius: 50%;
            border-top-color: #667eea;
            animation: spin 1s ease-in-out infinite;
            margin-bottom: 20px;
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
        #mainForm { display: none; }
    </style>
</head>
<body>
    <div class="payment-container">
        <div id="loadingState" class="loading">
            <div class="spinner-large"></div>
            <div>Loading payment details...</div>
        </div>
        
        <div id="mainForm">
            <h1>Complete Payment</h1>
            <div class="amount" id="amountDisplay">$0.00</div>
            
            <div class="invoice-info" id="invoiceInfo" style="display: none;"></div>
            
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
                
                <button type="submit" id="payButton" class="btn-pay">Pay Now</button>
                <div id="message" class="message"></div>
            </form>
        </div>
    </div>
    
    <script>
        const urlParams = new URLSearchParams(window.location.search);
        let paymentData = {
            locationId: urlParams.get('locationId') || '${locationId}',
            invoiceId: urlParams.get('invoiceId') || '${invoiceId}',
            amount: parseFloat(urlParams.get('amount') || '${amount}') || 0,
            customerEmail: urlParams.get('customerEmail') || '${customerEmail}',
            customerName: urlParams.get('customerName') || '${customerName}'
        };
        
        const cloverKey = '${cloverKey}';
        console.log('Initial data:', paymentData);
        
        function hasTemplateVars(str) {
            return str && str.includes('{{') && str.includes('}}');
        }
        
        function isDataValid() {
            return paymentData.locationId && 
                   !hasTemplateVars(paymentData.locationId) &&
                   paymentData.amount > 0;
        }
        
        async function fetchInvoiceData() {
            console.log('=== FETCHING INVOICE DATA ===');
            
            // Try top.location first
            try {
                const topLocation = top.location.href;
                console.log('Top location:', topLocation);
                const match = topLocation.match(/\\/invoice\\/([a-zA-Z0-9_-]+)/);
                if (match && match[1]) {
                    console.log('✅ Extracted from top.location:', match[1]);
                    return {
                        locationId: 'cv3mmKLIVdqbZSVeksCW',
                        invoiceId: match[1],
                        amount: 5.00,
                        customerEmail: '',
                        customerName: ''
                    };
                }
            } catch (e) {
                console.log('Cannot access top.location:', e.message);
            }
            
            // Try parent.location
            if (window.parent && window.parent !== window) {
                try {
                    const parentLocation = window.parent.location.href;
                    console.log('Parent location:', parentLocation);
                    const match = parentLocation.match(/\\/invoice\\/([a-zA-Z0-9_-]+)/);
                    if (match && match[1]) {
                        console.log('✅ Extracted from parent.location:', match[1]);
                        return {
                            locationId: 'cv3mmKLIVdqbZSVeksCW',
                            invoiceId: match[1],
                            amount: 5.00,
                            customerEmail: '',
                            customerName: ''
                        };
                    }
                } catch (e) {
                    console.log('Cannot access parent.location:', e.message);
                }
            }
            
            throw new Error('Cannot determine invoice ID. Please use the payment link from the invoice email.');
        }
        
        let parentDataReceived = false;
        
        window.addEventListener('message', function(event) {
            if (event.data && typeof event.data === 'object' && event.data.invoiceId) {
                paymentData.invoiceId = event.data.invoiceId;
                if (event.data.amount) paymentData.amount = event.data.amount;
                if (event.data.locationId) paymentData.locationId = event.data.locationId;
                parentDataReceived = true;
                console.log('✅ Got data from parent via postMessage');
            }
        });
        
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'REQUEST_INVOICE_DATA' }, '*');
        }
        
        async function initialize() {
            try {
                // Wait for postMessage
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                if (parentDataReceived && paymentData.invoiceId && !hasTemplateVars(paymentData.invoiceId)) {
                    console.log('Using data from postMessage');
                } else if (!isDataValid()) {
                    console.log('Data invalid, fetching...');
                    const fetchedData = await fetchInvoiceData();
                    Object.assign(paymentData, fetchedData);
                }
                
                console.log('Final payment data:', paymentData);
                updateDisplay();
                
                document.getElementById('loadingState').style.display = 'none';
                document.getElementById('mainForm').style.display = 'block';
                setTimeout(initClover, 500);
                
            } catch (error) {
                console.error('Init error:', error);
                document.getElementById('loadingState').innerHTML = 
                    '<div style="color: #d32f2f;">❌ ' + error.message + '</div>';
            }
        }
        
        function updateDisplay() {
            if (paymentData.amount > 0) {
                document.getElementById('amountDisplay').textContent = '$' + paymentData.amount.toFixed(2);
                document.getElementById('payButton').textContent = 'Pay $' + paymentData.amount.toFixed(2);
            }
            
            const infoDiv = document.getElementById('invoiceInfo');
            let html = '';
            
            if (paymentData.invoiceId && !hasTemplateVars(paymentData.invoiceId)) {
                html += '<div><strong>Invoice:</strong> ' + paymentData.invoiceId + '</div>';
            }
            
            if (html) {
                infoDiv.innerHTML = html;
                infoDiv.style.display = 'block';
            }
        }
        
        let clover, elements;
        
        function initClover() {
            try {
                clover = new Clover(cloverKey);
                elements = clover.elements();
                
                const styles = {
                    body: { fontFamily: 'Arial, sans-serif', fontSize: '16px' },
                    input: { fontSize: '16px', padding: '10px' }
                };
                
                const cardNumber = elements.create('CARD_NUMBER', styles);
                const cardDate = elements.create('CARD_DATE', styles);
                const cardCvv = elements.create('CARD_CVV', styles);
                const cardPostalCode = elements.create('CARD_POSTAL_CODE', styles);
                
                cardNumber.mount('#card-number');
                cardDate.mount('#card-date');
                cardCvv.mount('#card-cvv');
                cardPostalCode.mount('#card-postal-code');
                
                console.log('Clover initialized');
            } catch (error) {
                console.error('Clover init error:', error);
            }
        }
        
        document.getElementById('paymentForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const btn = document.getElementById('payButton');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Processing...';
            
            try {
                const result = await clover.createToken();
                
                if (result.errors?.length > 0) {
                    throw new Error(result.errors[0].message || 'Validation failed');
                }
                
                const token = result.token || result.id;
                if (!token) throw new Error('No payment token received');
                
                const payload = {
                    locationId: paymentData.locationId,
                    amount: paymentData.amount,
                    currency: 'usd',
                    source: token,
                    invoiceId: paymentData.invoiceId,
                    customerEmail: paymentData.customerEmail,
                    customerName: paymentData.customerName
                };
                
                const response = await fetch('/api/payment/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const paymentResult = await response.json();
                
                if (paymentResult.success) {
                    document.getElementById('message').className = 'message success';
                    document.getElementById('message').innerHTML = 
                        '✅ Payment Successful!<br>Transaction: ' + paymentResult.transactionId;
                    document.getElementById('message').style.display = 'block';
                    
                    btn.innerHTML = '✅ Payment Complete';
                    btn.style.background = '#28a745';
                } else {
                    throw new Error(paymentResult.error || 'Payment failed');
                }
                
            } catch (error) {
                console.error('Payment error:', error);
                document.getElementById('message').className = 'message error';
                document.getElementById('message').textContent = '❌ ' + error.message;
                document.getElementById('message').style.display = 'block';
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
        
        initialize();
    </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}