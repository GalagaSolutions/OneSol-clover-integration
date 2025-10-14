/**
 * Payment Iframe Handler - V2 API
 * This is the paymentsUrl that GHL loads in an iframe
 * It needs to implement the iframe communication protocol from:
 * https://help.gohighlevel.com/support/solutions/articles/155000002620
 */
export default function handler(req, res) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Clover Payment</title>
    <script src="https://checkout.sandbox.dev.clover.com/sdk.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            padding: 20px;
        }
        .payment-container {
            max-width: 500px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h2 { margin-bottom: 20px; color: #333; font-size: 20px; }
        .amount-display {
            text-align: center;
            font-size: 32px;
            font-weight: 700;
            color: #667eea;
            margin-bottom: 30px;
        }
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
        }
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
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading { text-align: center; padding: 40px; color: #666; }
    </style>
</head>
<body>
    <div class="payment-container">
        <div id="loading" class="loading">
            <div class="spinner"></div>
            <p>Loading payment form...</p>
        </div>
        
        <div id="payment-form" style="display: none;">
            <h2>Complete Payment</h2>
            <div id="amount-display" class="amount-display"></div>
            
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
        let paymentData = null;
        let clover, elements, cardNumber, cardDate, cardCvv, cardPostalCode;
        
        console.log("🚀 Payment iframe loaded");
        
        // STEP 1: Send ready event to GHL
        function sendReadyEvent() {
            const readyEvent = {
                type: 'custom_provider_ready',
                loaded: true,
                addCardOnFileSupported: false
            };
            
            console.log("📤 Sending ready event:", readyEvent);
            window.parent.postMessage(readyEvent, '*');
        }
        
        // STEP 2: Listen for payment data from GHL
        window.addEventListener('message', function(event) {
            console.log("📨 Message received:", event.data);
            
            if (event.data.type === 'payment_initiate_props') {
                paymentData = event.data;
                console.log("✅ Payment data received:", paymentData);
                initializePayment();
            } else if (event.data.type === 'setup_initiate_props') {
                console.log("ℹ️ Setup mode not supported");
                sendErrorResponse("Card on file not supported");
            }
        });
        
        function initializePayment() {
            const amount = paymentData.amount || 0;
            const currency = paymentData.currency || 'USD';
            
            document.getElementById('amount-display').textContent = 
                new Intl.NumberFormat('en-US', { 
                    style: 'currency', 
                    currency: currency 
                }).format(amount);
            
            document.getElementById('loading').style.display = 'none';
            document.getElementById('payment-form').style.display = 'block';
            
            // Initialize Clover
            initializeClover(paymentData.publishableKey);
        }
        
        function initializeClover(publishableKey) {
            console.log("🔧 Initializing Clover with key:", publishableKey?.substring(0, 10) + "...");
            
            try {
                if (typeof Clover === 'undefined') {
                    throw new Error('Clover SDK not loaded');
                }
                
                clover = new Clover(publishableKey);
                elements = clover.elements();
                
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
                
                console.log("✅ Clover elements mounted");
                
            } catch (error) {
                console.error("❌ Clover init error:", error);
                showMessage('error', error.message);
            }
        }
        
        // STEP 3: Handle form submission
        document.getElementById('paymentForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const btn = document.getElementById('payButton');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Processing...';
            
            try {
                // Create Clover token
                const result = await clover.createToken();
                
                if (result.errors?.length > 0) {
                    throw new Error(result.errors[0].message || 'Tokenization failed');
                }
                
                const token = result.token || result.id;
                if (!token) {
                    throw new Error('No payment token received');
                }
                
                console.log("✅ Token created:", token.substring(0, 15) + "...");
                
                // Send token to backend for processing
                const response = await fetch('/api/payment/process-iframe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: token,
                        amount: paymentData.amount,
                        currency: paymentData.currency,
                        orderId: paymentData.orderId,
                        transactionId: paymentData.transactionId,
                        subscriptionId: paymentData.subscriptionId,
                        locationId: paymentData.locationId,
                        contact: paymentData.contact,
                        publishableKey: paymentData.publishableKey
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    console.log("✅ Payment successful:", result.chargeId);
                    
                    // STEP 4: Send success event to GHL
                    sendSuccessResponse(result.chargeId);
                    
                } else {
                    throw new Error(result.error || 'Payment failed');
                }
                
            } catch (error) {
                console.error("❌ Payment error:", error);
                
                // STEP 5: Send error event to GHL
                sendErrorResponse(error.message);
                
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
        
        function sendSuccessResponse(chargeId) {
            const successEvent = {
                type: 'custom_element_success_response',
                chargeId: chargeId
            };
            
            console.log("📤 Sending success event:", successEvent);
            window.parent.postMessage(successEvent, '*');
        }
        
        function sendErrorResponse(errorMessage) {
            const errorEvent = {
                type: 'custom_element_error_response',
                error: {
                    description: errorMessage
                }
            };
            
            console.log("📤 Sending error event:", errorEvent);
            window.parent.postMessage(errorEvent, '*');
        }
        
        function sendCloseResponse() {
            const closeEvent = {
                type: 'custom_element_close_response'
            };
            
            console.log("📤 Sending close event:", closeEvent);
            window.parent.postMessage(closeEvent, '*');
        }
        
        function showMessage(type, text) {
            const messageDiv = document.getElementById('message');
            messageDiv.className = \`message \${type}\`;
            messageDiv.textContent = text;
            messageDiv.style.display = 'block';
        }
        
        // Initialize on load
        window.addEventListener('load', function() {
            setTimeout(() => {
                sendReadyEvent();
            }, 500);
        });
    </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}