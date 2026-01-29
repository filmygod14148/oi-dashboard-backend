const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const apiRoutes = require('./routes/api');
const { fetchNSEData, closeBrowser } = require('./services/nseService');

dotenv.config();

console.log('DEBUG: Env Check');
console.log('PORT:', process.env.PORT);
console.log('USE_MOCK_DATA:', process.env.USE_MOCK_DATA);
console.log('CWD:', process.cwd());

if (!process.env.MONGODB_URI) {
    console.error('❌ FATAL ERROR: MONGODB_URI is not defined!');
    console.error('   Please add MONGODB_URI to your Vercel Environment Variables.');
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Background Polling Logic: Removed for serverless/manual refresh mode

// Start Server Immediately to avoid Render port timeout
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(`  BACKEND SERVER RUNNING ON PORT ${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log(`  Mock Data: ${process.env.USE_MOCK_DATA}`);
    console.log(`========================================`);
    console.log(`✓ Manual refresh required via /api/refresh`);
});

// Database Connection - MongoDB Atlas
const mongoOptions = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
};

mongoose.connect(process.env.MONGODB_URI, mongoOptions)
    .then(() => {
        console.log('✓ MongoDB Atlas Connected');
    })
    .catch(err => {
        console.error('✗ MongoDB Atlas Connection Error:', err.message);
    });

// Routes
app.use('/api', apiRoutes);

// Graceful Shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await closeBrowser();
    process.exit(0);
});

// Render deployment trigger: 2026-01-27
