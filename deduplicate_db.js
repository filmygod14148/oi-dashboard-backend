const mongoose = require('mongoose');
const dotenv = require('dotenv');
const OIData = require('./models/OIData');

dotenv.config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/oi_dashboard')
    .then(async () => {
        console.log('MongoDB Connected for cleanup');

        const symbols = ['NIFTY', 'BANKNIFTY'];

        for (const symbol of symbols) {
            console.log(`Checking duplicates for ${symbol}...`);
            const allData = await OIData.find({ symbol }).sort({ timestamp: 1 });

            const uniqueTimestamps = new Set();
            const idsToDelete = [];

            for (const doc of allData) {
                // Use NSE timestamp if available, otherwise fall back to mongo timestamp (rounded to minute)
                let timeKey;
                if (doc.data && doc.data.nseTimestamp) {
                    timeKey = doc.data.nseTimestamp;
                } else {
                    // Fallback: round creation time to nearest minute to catch simultaneous fetches
                    const date = new Date(doc.timestamp);
                    date.setSeconds(0);
                    date.setMilliseconds(0);
                    timeKey = date.toISOString();
                }

                if (uniqueTimestamps.has(timeKey)) {
                    idsToDelete.push(doc._id);
                } else {
                    uniqueTimestamps.add(timeKey);
                }
            }

            if (idsToDelete.length > 0) {
                console.log(`Found ${idsToDelete.length} duplicates for ${symbol}. Deleting...`);
                await OIData.deleteMany({ _id: { $in: idsToDelete } });
                console.log('Deleted.');
            } else {
                console.log(`No duplicates found for ${symbol}.`);
            }
        }

        console.log('Cleanup complete.');
        process.exit();
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
