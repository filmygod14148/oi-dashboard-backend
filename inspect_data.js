const mongoose = require('mongoose');
const OIData = require('./models/OIData');

mongoose.connect('mongodb://127.0.0.1:27017/oi_dashboard')
    .then(async () => {
        const history = await OIData.find().sort({ timestamp: -1 }).limit(3);
        if (history.length > 0) {
            console.log(`Found ${history.length} records.`);
            history.forEach((rec, i) => {
                const spot = rec.data.records.underlyingValue;
                const atm = Math.round(spot / 50) * 50;
                const row = rec.data.records.data.find(r => r.strikePrice === atm);
                console.log(`[${i}] Time: ${rec.timestamp}, Spot: ${spot}, ATM(${atm}) CE_OI: ${row?.CE?.openInterest}`);
            });
        }
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
