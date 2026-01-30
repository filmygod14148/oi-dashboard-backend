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

// Background Polling Logic
let isPolling = false;
const pollInterval = 3 * 60 * 1000; // 3 minutes

const startBackgroundPolling = async () => {
    if (isPolling) return;
    isPolling = true;

    const symbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'];
    console.log(`[Poll] Starting background auto-fetch for ${symbols.join(', ')}...`);

    try {
        for (const symbol of symbols) {
            await fetchNSEData(symbol);
            // Wait 2 seconds between symbols to avoid hitting NSE rate limits
            await new Promise(r => setTimeout(r, 2000));
        }
        console.log('[Poll] Background fetch loop completed.');
    } catch (err) {
        console.error('[Poll] Error in background fetch loop:', err.message);
    } finally {
        isPolling = false;
    }
};

// Start Server Immediately to avoid Render port timeout
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(`  BACKEND SERVER RUNNING ON PORT ${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log(`  Mock Data: ${process.env.USE_MOCK_DATA}`);
    console.log(`========================================`);
    console.log(`✓ Automatic polling every 3 minutes`);

    // Initial poll after 10 seconds to let DB connect
    setTimeout(startBackgroundPolling, 10000);

    // Set interval for subsequent polls
    setInterval(startBackgroundPolling, pollInterval);
});

// Database Connection - MongoDB Atlas
const mongoOptions = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
};

mongoose.connect(process.env.MONGODB_URI, mongoOptions)
    .then(() => {
        console.log(`✓ MongoDB Atlas Connected to: ${mongoose.connection.name}`);
    })
    .catch(err => {
        console.error('✗ MongoDB Atlas Connection Error:', err.message);
    });

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        time: new Date().toISOString(),
        db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Logs for API requests
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        console.log(`[API] ${req.method} ${req.path} ${JSON.stringify(req.query)}`);
    }
    next();
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
