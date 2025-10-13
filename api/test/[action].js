const { getCloverConfig } = require('../utils/cloverConfig');
const { getLocationTokenFromRequest } = require('../utils/getLocationToken');

module.exports = async (req, res) => {
  const { action } = req.query;

  try {
    switch (action) {
      case 'diagnostics':
        return await handleDiagnostics(req, res);
      case 'register-provider':
        return await handleRegisterProvider(req, res);
      case 'clover-connection':
        return await handleCloverConnection(req, res);
      default:
        res.status(400).json({ error: 'Invalid test action' });
    }
  } catch (error) {
    console.error(`Error in test/${action}:`, error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

async function handleDiagnostics(req, res) {
  try {
    const config = await getCloverConfig();
    res.json({
      status: 'ok',
      config: {
        hasClientId: !!config.clientId,
        hasClientSecret: !!config.clientSecret,
        hasCallbackUrl: !!config.callbackUrl
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function handleRegisterProvider(req, res) {
  try {
    const locationId = req.query.locationId;
    if (!locationId) {
      return res.status(400).json({ error: 'Location ID is required' });
    }

    const response = await fetch(`https://api.zstackserver.com/api/v1/providers/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GHL_API_KEY}`
      },
      body: JSON.stringify({
        locationId: locationId,
        provider: 'clover',
        providerData: {
          name: 'Clover',
          description: 'Clover POS Integration'
        }
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function handleCloverConnection(req, res) {
  try {
    const token = await getLocationTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized - No valid token found' });
    }

    const merchantId = req.query.merchantId;
    if (!merchantId) {
      return res.status(400).json({ error: 'Merchant ID is required' });
    }

    const response = await fetch(`https://api.clover.com/v3/merchants/${merchantId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Clover API error: ${response.statusText}`);
    }

    const data = await response.json();
    res.json({
      status: 'connected',
      merchantName: data.name,
      merchantId: data.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}