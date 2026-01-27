const mongoose = require('mongoose');
const { fetchNSEData } = require('./services/nseService');
require('dotenv').config();

// Ensure Mock is false
process.env.USE_MOCK_DATA = 'false';

mongoose.connect('mongodb://127.0.0.1:27017/oi_dashboard')
    .then(async () => {
        console.log('Connected. Fetching Real Data (Puppeteer)...');
        try {
            const data = await fetchNSEData('NIFTY');
            if (data) {
                console.log('SUCCESS: Data Fetched.');
                console.log('Underlying Value:', data.records.underlyingValue);
            } else {
                console.log('FAILURE: No data returned (likely blocked/error).');
            }
        } catch (e) {
            console.error('ERROR:', e.message);
        }
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
