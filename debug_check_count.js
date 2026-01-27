const mongoose = require('mongoose');
const OIData = require('./models/OIData');

mongoose.connect('mongodb://127.0.0.1:27017/oi_dashboard')
    .then(async () => {
        console.log('Connected to DB');
        const count = await OIData.countDocuments();
        console.log(`Total Records in DB: ${count}`);

        if (count > 0) {
            const first = await OIData.findOne().sort({ timestamp: 1 }); // Oldest
            const last = await OIData.findOne().sort({ timestamp: -1 }); // Newest
            console.log(`Oldest Record: ${first.timestamp}`);
            console.log(`Newest Record: ${last.timestamp}`);
        }

        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
