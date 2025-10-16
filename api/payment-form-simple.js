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
        
        // Check if we have template variables ({{...}})
        function hasTemplateVars(str) {
            return str && str.includes('{{') && str.includes('}}');
        }
        
        function isDataValid() {
            return paymentData.locationId && 
                   !hasTemplateVars(paymentData.locationId) &&
                   paymentData.amount > 0;
        }
        
        // Try to get invoiceId from current page URL or referrer
        function extractInvoiceIdFromURL() {
            // Try referrer first (the page that loaded this iframe)
            const referrer = document.referrer;
            if (referrer) {
                console.log('Checking referrer URL:', referrer);
                const patterns = [
                    /\/invoice\/([a-zA-Z0-9_-]+)/,  // /invoice/abc123
                    /invoiceId[=:]([a-zA-Z0-9_-]+)/, // invoiceId=abc123
                ];
                
                for (const pattern of patterns) {
                    const match = referrer.match(pattern);
                    if (match && match[1]) {
                        console.log('Found invoiceId in referrer:', match[1]);
                        return match[1];
                    }
                }
            }
            
            // Try current URL as fallback
            const currentUrl = window.location.href;
            console.log('Checking current URL:', currentUrl);
            const patterns = [
                /\/invoice\/([a-zA-Z0-9_-]+)/,
                /invoiceId[=:]([a-zA-Z0-9_-]+)/,
            ];
            
            for (const pattern of patterns) {
                const match = currentUrl.match(pattern);
                if (match && match[1]) {
                    console.log('Found invoiceId in current URL:', match[1]);
                    return match[1];
                }
            }
            
            console.log('Could not extract invoiceId from any URL');
            return null;
        }
        
        // If data invalid, try to fetch from GHL invoice page
        async function fetchInvoiceData() {
            const invoiceId = extractInvoiceIdFromURL();
            
            if (!invoiceId) {
                throw new Error('Cannot determine invoice ID');
            }
            
            console.log('Fetching invoice data for:', invoiceId);
            
            // Try to get data from a backend endpoint
            try {
                const response = await fetch(\`/api/invoice/\${invoiceId}\`);
                if (response.ok) {
                    const data = await response.json();
                    return data;
                }
            } catch (e) {
                console.log('Could not fetch invoice data:', e);
            }
            
            // Fallback: use cv3mmKLIVdqbZSVeksCW as default location
            return {
                locationId: 'cv3mmKLIVdqbZSVeksCW',
                invoiceId: invoiceId,
                amount: 5.00, // Default amount
                customerEmail: '',
                customerName: ''
            };
        }
        
        async function initialize() {
            try {
                // Check if we have valid data
                if (!isDataValid()) {
                    console.log('Data invalid or has templates, fetching...');
                    const fetchedData = await fetchInvoiceData();
                    Object.assign(paymentData, fetchedData);
                }
                
                console.log('Final payment data:', paymentData);
                
                // Update display
                updateDisplay();
                
                // Hide loading, show form
                document.getElementById('loadingState').style.display = 'none';
                document.getElementById('mainForm').style.display = 'block';
                
                // Initialize Clover
                setTimeout(initClover, 500);
                
            } catch (error) {
                console.error('Initialization error:', error);
                document.getElementById('loadingState').innerHTML = 
                    '<div style="color: #d32f2f;">❌ ' + error.message + '</div>' +
                    '<div style="font-size: 14px; margin-top: 10px;">Please contact support</div>';
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
            if (paymentData.customerName && !hasTemplateVars(paymentData.customerName)) {
                html += '<div><strong>Customer:</strong> ' + paymentData.customerName + '</div>';
            }
            if (paymentData.customerEmail && !hasTemplateVars(paymentData.customerEmail)) {
                html += '<div><strong>Email:</strong> ' + paymentData.customerEmail + '</div>';
            }
            
            if (html) {
                infoDiv.innerHTML = html;
                infoDiv.style.display = 'block';
            }
        }
        
        let clover, elements;
        
        function initClover() {
            try {
                if (typeof Clover === 'undefined') {
                    throw new Error('Clover SDK not loaded');
                }
                
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
                showMessage('error', 'Payment system initialization failed: ' + error.message);
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
                if (!token) {
                    throw new Error('No payment token received');
                }
                
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
                    showMessage('success', 
                        '✅ Payment Successful!<br>' +
                        'Transaction: ' + paymentResult.transactionId + '<br>' +
                        'Amount: $' + paymentResult.amount
                    );
                    
                    btn.innerHTML = '✅ Payment Complete';
                    btn.style.background = '#28a745';
                } else {
                    throw new Error(paymentResult.error || 'Payment failed');
                }
                
            } catch (error) {
                console.error('Payment error:', error);
                showMessage('error', '❌ ' + error.message);
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
        
        function showMessage(type, text) {
            const msg = document.getElementById('message');
            msg.className = 'message ' + type;
            msg.innerHTML = text;
            msg.style.display = 'block';
        }
        
        // Start initialization
        initialize();
    </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}