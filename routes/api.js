const express = require('express');
const router = express.Router();
const OIData = require('../models/OIData');
const { fetchNSEData } = require('../services/nseService');

// Get latest data
router.get('/latest', async (req, res) => {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ msg: 'Symbol required' });

    try {
        // Find absolute latest
        const data = await OIData.findOne({ symbol }).sort({ timestamp: -1 });
        res.json(data);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// Get history (for charts)
router.get('/history', async (req, res) => {
    const { symbol, limit } = req.query;
    if (!symbol) return res.status(400).json({ msg: 'Symbol required' });

    try {
        let query = OIData.find({ symbol }).sort({ timestamp: -1 });

        // If limit is provided and not 'all' or '0', apply it. 
        // Otherwise fetch all.
        if (limit && limit !== 'all' && limit !== '0') {
            const limitVal = parseInt(limit);
            if (!isNaN(limitVal) && limitVal > 0) {
                query = query.limit(limitVal);
            }
        }

        const data = await query;
        res.json(data.reverse()); // Return oldest to newest for charts
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// Manual Refresh (Supports POST and GET for external pingers)
router.all('/refresh', async (req, res) => {
    const symbol = req.body.symbol || req.query.symbol || 'NIFTY';

    if (!symbol) return res.status(400).json({ msg: 'Symbol required' });

    try {
        console.log(`[API] Manual refresh requested for ${symbol}`);
        // Timeout protection (max 30 seconds for scraping)
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 30000)
        );

        const data = await Promise.race([
            fetchNSEData(symbol),
            timeoutPromise
        ]);

        console.log(`[API] Refresh completed for ${symbol}`);
        res.json({ msg: 'Refreshed', data });
    } catch (err) {
        if (err.message === 'Request timeout') {
            res.status(504).json({ msg: 'Request timeout - try again' });
        } else {
            res.status(500).json({ msg: 'Error refreshing', error: err.message });
        }
    }
});

module.exports = router;
