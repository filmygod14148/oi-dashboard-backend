const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const run = async () => {
    try {
        console.log('Connecting to:', process.env.MONGODB_URI.replace(/:.+@/, ':****@'));
        await mongoose.connect(process.env.MONGODB_URI);

        console.log('✓ Connected');
        console.log('Database Name:', mongoose.connection.name);

        const admin = mongoose.connection.db.admin();
        const dbs = await admin.listDatabases();
        console.log('\nAvailable Databases in Cluster:');
        dbs.databases.forEach(db => console.log(` - ${db.name}`));

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log(`\nCollections in "${mongoose.connection.name}":`);
        collections.forEach(col => console.log(` - ${col.name}`));

        const count = await mongoose.connection.db.collection('oidatas').countDocuments();
        console.log(`\nDocument count in "oidatas": ${count}`);

        const latest = await mongoose.connection.db.collection('oidatas').find().sort({ timestamp: -1 }).limit(1).toArray();
        if (latest.length > 0) {
            console.log('Latest Document Timestamp:', latest[0].timestamp);
            console.log('Latest Document ID:', latest[0]._id);
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

run();
