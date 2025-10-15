export default function handler(req, res) {
  // Clover connection test
  if (req.query.test === "clover") {
    const merchantId = process.env.CLOVER_MERCHANT_ID;
    const apiToken = process.env.CLOVER_API_TOKEN;
    const environment = process.env.CLOVER_ENVIRONMENT;

    return res.status(200).json({
      connected: !!(merchantId && apiToken && environment),
      merchantId: merchantId ? `${merchantId.substring(0, 4)}...` : "NOT SET",
      hasApiToken: !!apiToken,
      environment: environment || "NOT SET",
    });
  }

  // Rest of the existing setup page code...
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Clover Setup</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 500px;
            width: 100%;
            padding: 40px;
        }
        
        .logo {
            text-align: center;
            margin-bottom: 30px;
        }
        
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }
        
        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
            font-size: 14px;
        }
        
        input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s;
        }
        
        input:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .mode-toggle {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .mode-btn {
            flex: 1;
            padding: 12px;
            border: 2px solid #e0e0e0;
            background: white;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s;
        }
        
        .mode-btn.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }
        
        .btn {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        
        .btn:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
        }
        
        .message {
            padding: 12px;
            border-radius: 8px;
            margin-top: 20px;
            display: none;
            font-size: 14px;
        }
        
        .message.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .message.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .help-text {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }
        
        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 3px solid rgba(255,255,255,.3);
            border-radius: 50%;
            border-top-color: #fff;
            animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <svg width="80" height="80" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="45" fill="#FF6B35"/>
                <path d="M30 50 L45 65 L70 35" stroke="white" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        
        <h1>Clover Setup</h1>
        <p class="subtitle">Connect your Clover payment processor to GoHighLevel</p>
        
        <form id="setupForm">
            <div class="mode-toggle">
                <button type="button" class="mode-btn active" data-mode="test">Test Mode</button>
                <button type="button" class="mode-btn" data-mode="live">Live Mode</button>
            </div>
            
            <div class="form-group">
                <label for="merchantId">Clover Merchant ID *</label>
                <input type="text" id="merchantId" required placeholder="Enter your Clover Merchant ID">
                <div class="help-text">Find this in your Clover Dashboard</div>
            </div>
            
            <div class="form-group">
                <label for="apiToken">Clover API Token *</label>
                <input type="password" id="apiToken" required placeholder="Enter your Clover API Token">
                <div class="help-text">Generate this in Clover Dashboard → API Tokens</div>
            </div>
            
            <div class="form-group">
                <label for="publicKey">Clover Public Key</label>
                <input type="text" id="publicKey" placeholder="Optional: For frontend payments">
            </div>
            
            <button type="submit" class="btn" id="submitBtn">
                Save Configuration
            </button>
            
            <div id="message" class="message"></div>
        </form>
    </div>
    
    <script>
        // Get locationId from multiple sources - extract ONCE at page load
function getLocationId() {
    // Method 1: From URL params
    const urlParams = new URLSearchParams(window.location.search);
    let locationId = urlParams.get('location_id') || urlParams.get('locationId');
    
    // Check if it's a template placeholder
    if (locationId && !locationId.includes('{{') && !locationId.includes('}}')) {
        console.log('✅ Got locationId from URL:', locationId);
        return locationId;
    }
    
    // Method 2: From parent window URL (if in iframe)
    try {
        if (window.parent && window.parent !== window) {
            const parentUrl = window.parent.location.href;
            const match = parentUrl.match(/\/location\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                console.log('✅ Got locationId from parent URL:', match[1]);
                return match[1];
            }
        }
    } catch (e) {
        console.log('⚠️ Cannot access parent URL, trying referrer...');
        
        // Method 3: Try to get from document.referrer
        if (document.referrer) {
            const match = document.referrer.match(/\/location\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                console.log('✅ Got locationId from referrer:', match[1]);
                return match[1];
            }
        }
    }
    
    // Method 4: Last resort - check current page URL pattern
    const currentMatch = window.location.href.match(/locationId=([a-zA-Z0-9_-]+)/);
    if (currentMatch && currentMatch[1] && !currentMatch[1].includes('{{')) {
        console.log('✅ Got locationId from current URL:', currentMatch[1]);
        return currentMatch[1];
    }
    
    return null;
}
        
        function getCompanyId() {
            const urlParams = new URLSearchParams(window.location.search);
            let companyId = urlParams.get('company_id') || urlParams.get('companyId');
            
            if (companyId && !companyId.includes('{{') && !companyId.includes('}}')) {
                return companyId;
            }
            
            return null;
        }
        
        // Extract locationId and companyId ONCE at page load
        const locationId = getLocationId();
        const companyId = getCompanyId();
        
        console.log('📍 Setup page loaded');
        console.log('   LocationId:', locationId);
        console.log('   CompanyId:', companyId);
        
        let currentMode = 'test';
        
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentMode = this.dataset.mode;
            });
        });
        
        document.getElementById('setupForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!locationId) {
                showMessage('error', 'Missing location ID. Please access this page from the GHL app or use the direct URL with locationId parameter.');
                return;
            }
            
            const submitBtn = document.getElementById('submitBtn');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
            
            const config = {
                locationId: locationId,  // Use the extracted locationId from page load
                companyId: companyId,
                merchantId: document.getElementById('merchantId').value,
                apiToken: document.getElementById('apiToken').value,
                publicKey: document.getElementById('publicKey').value,
                liveMode: currentMode === 'live'
            };
            
            console.log('📤 Submitting config with locationId:', config.locationId);
            
            try {
                const response = await fetch('/api/config/save-clover-config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(config)
                });
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    showMessage('success', '✓ Configuration saved successfully! Clover is now connected.');
                    
                    setTimeout(() => {
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: 'SETUP_COMPLETE' }, '*');
                        }
                    }, 2000);
                } else {
                    showMessage('error', result.error || 'Failed to save configuration. Please try again.');
                }
            } catch (error) {
                console.error('Setup error:', error);
                showMessage('error', 'Network error. Please check your connection and try again.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
        
        function showMessage(type, text) {
            const messageDiv = document.getElementById('message');
            messageDiv.className = \`message \${type}\`;
            messageDiv.textContent = text;
            messageDiv.style.display = 'block';
            
            if (type === 'success') {
                setTimeout(() => {
                    messageDiv.style.display = 'none';
                }, 5000);
            }
        }
        
        // Show warning if no locationId found
        if (!locationId) {
            showMessage('error', 'Warning: No location ID detected. Make sure you access this page from the GHL app.');
        }
    </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}