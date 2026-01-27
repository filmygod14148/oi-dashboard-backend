const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const OIData = require('../models/OIData');

puppeteer.use(StealthPlugin());

const NSE_URL = process.env.NSE_URL || 'https://www.nseindia.com/api/option-chain-indices?symbol=';
const OPTION_CHAIN_URL = process.env.OPTION_CHAIN_URL || 'https://www.nseindia.com/option-chain';

// Browser instance management
let browserInstance = null;
let browserLaunchPromise = null;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 3000; // Minimum 3 seconds between requests
const requestQueue = [];
let isProcessingQueue = false;

const generateMockData = (symbol) => {
    const basePrice = symbol === 'NIFTY' ? 19500 : 44500;
    const records = [];
    const strikes = [];

    // Generate 20 strikes around base
    for (let i = -10; i <= 10; i++) {
        const strike = basePrice + (i * 50);
        strikes.push(strike);

        const ceOI = Math.floor(Math.random() * 100000);
        const peOI = Math.floor(Math.random() * 100000);

        records.push({
            strikePrice: strike,
            expiryDate: '28-Dec-2023',
            CE: { openInterest: ceOI, changeinOpenInterest: Math.floor(Math.random() * 5000) },
            PE: { openInterest: peOI, changeinOpenInterest: Math.floor(Math.random() * 5000) }
        });
    }

    // Totals
    const totCE = records.reduce((acc, r) => acc + r.CE.openInterest, 0);
    const totPE = records.reduce((acc, r) => acc + r.PE.openInterest, 0);

    return {
        records: {
            expiryDates: ['28-Dec-2023', '04-Jan-2024'],
            data: records,
            timestamp: new Date().toString(),
            underlyingValue: basePrice + (Math.random() * 100 - 50)
        },
        filtered: {
            data: records,
            CE: { totOI: totCE },
            PE: { totOI: totPE }
        }
    };
};

// Get or create a shared browser instance
const getBrowser = async () => {
    if (browserInstance && browserInstance.isConnected()) {
        return browserInstance;
    }

    // If already launching, wait for it
    if (browserLaunchPromise) {
        return await browserLaunchPromise;
    }

    // Launch new browser
    browserLaunchPromise = puppeteer.launch({
        executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920,1080',
            '--disable-blink-features=AutomationControlled'
        ],
        defaultViewport: {
            width: 1920,
            height: 1080
        }
    }).then(browser => {
        browserInstance = browser;
        browserLaunchPromise = null;
        // console.log('✓ Browser instance created');

        // Handle browser disconnect
        browser.on('disconnected', () => {
            console.log('Browser disconnected, clearing instance');
            browserInstance = null;
        });

        return browser;
    }).catch(err => {
        browserLaunchPromise = null;
        throw err;
    });

    return await browserLaunchPromise;
};

// Cleanup browser instance
const closeBrowser = async () => {
    if (browserInstance) {
        try {
            await browserInstance.close();
            browserInstance = null;
            // console.log('✓ Browser instance closed');
        } catch (err) {
            console.error('Error closing browser:', err.message);
        }
    }
};

// Sleep utility
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Rate limiting wrapper
const waitForRateLimit = async () => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        // console.log(`Rate limiting: waiting ${waitTime}ms`);
        await sleep(waitTime);
    }

    lastRequestTime = Date.now();
};

const fetchNSEData = async (symbol, retryCount = 0) => {
    // SERVERLESS MODE: Use mock data if enabled
    // SERVERLESS MODE: Use mock data if enabled
    const useMock = process.env.USE_MOCK_DATA && String(process.env.USE_MOCK_DATA).trim().toLowerCase() === 'true';

    if (useMock) {
        console.log(`[${symbol}] Using mock data (USE_MOCK_DATA=${process.env.USE_MOCK_DATA})`);
        const mockData = generateMockData(symbol);
        // Ensure mock data has a timestamp to avoid comparison issues if needed, 
        // though our fixed check above handles undefined.
        mockData.nseTimestamp = `MOCK_${new Date().setSeconds(0, 0)}`;
        const saveResult = await saveDataWithDifference(symbol, mockData);
        if (saveResult && saveResult.status === 'no_change') {
            return saveResult;
        }
        return saveResult || null;
    }

    const MAX_RETRIES = 2;

    // Rate limiting
    await waitForRateLimit();

    let page;
    try {
        // console.log(`[${symbol}] Starting fetch (attempt ${retryCount + 1}/${MAX_RETRIES + 1})...`);

        // Use shared browser instance
        const browser = await getBrowser();
        page = await browser.newPage();

        // Debug Logging
        const fs = require('fs');
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('Detected Headers') || text.includes('IV Indices') || text.includes('First Row') || text.includes('No table found')) {
                try { fs.appendFileSync('scraper_debug.log', `[${symbol}] [PAGE] ${text}\n`); } catch (e) { }
            }
        });

        // Enhanced anti-detection
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            window.chrome = { runtime: {} };
        });

        // Set realistic headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Referer': 'https://www.nseindia.com',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Upgrade-Insecure-Requests': '1'
        });

        // Optimize: Block unnecessary resources
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // METHOD: Network Interception with shorter timeout
        const apiResponsePromise = page.waitForResponse(response =>
            response.url().includes('api/option-chain-indices') &&
            response.url().includes(symbol) &&
            response.status() === 200,
            { timeout: 25000 }
        ).catch(e => null);

        // console.log(`[${symbol}] Navigating to option chain page...`);

        // Navigate with reduced timeout
        try {
            await page.goto(OPTION_CHAIN_URL, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
        } catch (navError) {
            if (navError.message.includes('timeout')) {
                console.log(`[${symbol}] Navigation timeout, but continuing...`);
                // Don't throw, try to proceed
            } else {
                throw navError;
            }
        }

        // Wait a bit for dynamic content
        await sleep(2000);

        // Wait for the API response
        const response = await apiResponsePromise;

        if (response) {
            try { require('fs').appendFileSync('scraper_debug.log', `[${symbol}] [NODE] Intercepted API response\n`); } catch (e) { }
            // console.log(`[${symbol}] ✓ Intercepted API response`);
            try {
                const json = await response.json();
                if (json && json.records) {
                    // console.log(`[${symbol}] ✓ Successfully captured JSON from network`);
                    await page.close();
                    const saveResult = await saveDataWithDifference(symbol, json);
                    // Return explicit no-change marker to the caller so it does not treat this as saved
                    if (saveResult && saveResult.status === 'no_change') {
                        return saveResult;
                    }
                    // When saved, saveResult contains filtered payload; prefer returning that
                    return saveResult || null;
                }
            } catch (e) {
                console.error(`[${symbol}] Error parsing intercepted JSON:`, e.message);
            }
        }

        // Fallback: DOM Scraping
        console.log(`[${symbol}] API interception failed, trying DOM scraping...`);
        try { require('fs').appendFileSync('scraper_debug.log', `[${symbol}] [NODE] API failed, trying DOM scraping\n`); } catch (e) { }

        try {
            await page.waitForSelector('#optionChainTable-indices tbody tr', { timeout: 10000 });
        } catch (e) {
            console.log(`[${symbol}] Timeout waiting for table rows`);
            try { require('fs').appendFileSync('scraper_debug.log', `[${symbol}] [NODE] Timeout waiting for table rows\n`); } catch (e) { }
        }

        const scrapedData = await page.evaluate(() => {
            try {
                const table = document.querySelector('#optionChainTable-indices');
                if (!table) {
                    console.log('No table found');
                    return null;
                }

                // Get Spot Price
                let underlyingValue = 0;
                const spotEl = document.querySelector('#equity_underlyingVal') ||
                    document.querySelector('.underlying-value') ||
                    document.querySelector('span[id*="underlying"]');

                if (spotEl) {
                    const text = spotEl.innerText.replace(/[^0-9.]/g, '');
                    underlyingValue = parseFloat(text);
                }

                // Parse Headers to find indices
                const headerRow = table.querySelector('thead tr:nth-child(2)');
                const getHeaders = (row) => Array.from(row ? row.querySelectorAll('th') : []).map(th => th.innerText.replace(/\s+/g, ' ').trim());

                let headers = getHeaders(headerRow);

                if (headers.length === 0) {
                    const h1 = table.querySelector('thead tr:nth-child(1)');
                    if (h1) headers = getHeaders(h1);
                }

                // console.log('Detected Headers:', JSON.stringify(headers));

                // Helper to find index by keyword
                const getFirstIdx = (keywords) => headers.findIndex(h => keywords.some(k => h.toLowerCase() === k.toLowerCase() || h.toLowerCase().includes(k.toLowerCase())));
                const getLastIdx = (keywords) => {
                    for (let i = headers.length - 1; i >= 0; i--) {
                        if (keywords.some(k => headers[i].toLowerCase() === k.toLowerCase() || headers[i].toLowerCase().includes(k.toLowerCase()))) return i;
                    }
                    return -1;
                };

                const idxStrike = getFirstIdx(['Strike', 'Strike Price']);

                // CALLS (Left side - First occurrences)
                const idxCOI = getFirstIdx(['OI', 'Open Int']);
                const idxCChngOI = getFirstIdx(['Chng in OI', 'Change in OI']);
                const idxCVol = getFirstIdx(['Volume', 'Vol']);
                const idxCLTP = getFirstIdx(['LTP']);
                const idxCIV = getFirstIdx(['IV', 'Implied Volatility']);

                // PUTS (Right side - Last occurrences)

                // PUTS (Right side - Last occurrences)
                const idxPOI = getLastIdx(['OI', 'Open Int']);
                const idxPChngOI = getLastIdx(['Chng in OI', 'Change in OI']);
                const idxPVol = getLastIdx(['Volume', 'Vol']);
                const idxPLTP = getLastIdx(['LTP']);
                const idxPIV = getLastIdx(['IV', 'Implied Volatility']);

                const cleanCtx = (txt) => {
                    const val = parseFloat(txt.replace(/,/g, '') || 0);
                    return isNaN(val) ? 0 : val;
                };

                const rows = Array.from(table.querySelectorAll('tbody tr'));
                // console.log('Rows found:', rows.length);
                const records = [];

                rows.forEach((row, i) => {
                    const cols = row.querySelectorAll('td');
                    if (cols.length < 15) return;

                    const sIdx = idxStrike > -1 ? idxStrike : 11;
                    const val = (idx) => idx > -1 && idx < cols.length ? cleanCtx(cols[idx]?.innerText) : 0;

                    if (i === 0) {
                        const rawCIV = idxCIV > -1 ? cols[idxCIV]?.innerText : 'N/A';
                        // console.log('First Row Call IV raw:', rawCIV);
                    }

                    const c_OI = val(idxCOI > -1 ? idxCOI : 1);
                    const c_ChngOI = val(idxCChngOI > -1 ? idxCChngOI : 2);
                    const c_Vol = val(idxCVol > -1 ? idxCVol : 3);
                    const c_LTP = val(idxCLTP > -1 ? idxCLTP : 5);
                    const c_IV = val(idxCIV > -1 ? idxCIV : 4);

                    const strikePrice = cleanCtx(cols[sIdx]?.innerText);

                    const p_OI = val(idxPOI > -1 ? idxPOI : cols.length - 2);
                    const p_ChngOI = val(idxPChngOI > -1 ? idxPChngOI : cols.length - 3);
                    const p_Vol = val(idxPVol > -1 ? idxPVol : cols.length - 4);
                    const p_LTP = val(idxPLTP > -1 ? idxPLTP : cols.length - 6);
                    const p_IV = val(idxPIV > -1 ? idxPIV : cols.length - 5);

                    if (strikePrice > 0) {
                        records.push({
                            strikePrice: strikePrice,
                            expiryDate: 'N/A',
                            CE: { openInterest: c_OI, changeinOpenInterest: c_ChngOI, totalTradedVolume: c_Vol, lastPrice: c_LTP, impliedVolatility: c_IV },
                            PE: { openInterest: p_OI, changeinOpenInterest: p_ChngOI, totalTradedVolume: p_Vol, lastPrice: p_LTP, impliedVolatility: p_IV }
                        });
                    }
                });

                const timeEl = document.querySelector('#asondate') || document.querySelector('.run_time');
                const nseTimestamp = timeEl ? timeEl.innerText.replace('As on ', '').trim() : new Date().toString();

                return {
                    records: {
                        data: records,
                        timestamp: nseTimestamp,
                        underlyingValue: underlyingValue
                    },
                    filtered: {
                        data: records,
                        CE: { totOI: records.reduce((a, b) => a + (b.CE.openInterest || 0), 0) },
                        PE: { totOI: records.reduce((a, b) => a + (b.PE.openInterest || 0), 0) }
                    },
                    nseTimestamp: nseTimestamp
                };

            } catch (e) {
                return null;
            }
        });

        await page.close();

        if (scrapedData && scrapedData.records.data.length > 0) {
            console.log(`[${symbol}] ✓ Scraped ${scrapedData.records.data.length} records from DOM`);
            const saveResult = await saveDataWithDifference(symbol, scrapedData);
            if (saveResult && saveResult.status === 'no_change') {
                return saveResult;
            }
            return saveResult || null;
        } else {
            console.error(`[${symbol}] ✗ DOM scraping failed - no data found`);
        }

        return null;

    } catch (error) {
        if (page) {
            try {
                await page.close();
            } catch (e) {
                // Ignore close errors
            }
        }

        console.error(`[${symbol}] ✗ Error (attempt ${retryCount + 1}):`, error.message);

        // Retry logic with exponential backoff
        if (retryCount < MAX_RETRIES) {
            const backoffTime = Math.pow(2, retryCount) * 2000; // 2s, 4s, 8s
            console.log(`[${symbol}] Retrying in ${backoffTime}ms...`);
            await sleep(backoffTime);

            // Close and recreate browser on persistent failures
            if (error.message.includes('timeout') || error.message.includes('Protocol error')) {
                console.log(`[${symbol}] Closing browser due to error type`);
                await closeBrowser();
            }

            return fetchNSEData(symbol, retryCount + 1);
        }

        return null;
    }
};

// Helper: Save Data but also compute difference from last record
const saveDataWithDifference = async (symbol, dataPayload) => {
    try {
        // 1. Get last record to compare
        const lastRecord = await OIData.findOne({ symbol }).sort({ timestamp: -1 });

        // STRICT TIMESTAMP CHECK: If NSE timestamp hasn't changed, the data hasn't changed.
        if (dataPayload.nseTimestamp && lastRecord && lastRecord.data && lastRecord.data.nseTimestamp === dataPayload.nseTimestamp) {
            // console.log(`[${symbol}] NSE Timestamp unchanged (${dataPayload.nseTimestamp}). Skipping Save.`);
            return { status: 'no_change' };
        }

        // DUPLICATE CHECK: Deep comparison of OI values for every strike
        if (lastRecord && lastRecord.data && lastRecord.data.records && lastRecord.data.records.data) {
            const prevDataMap = new Map();
            lastRecord.data.records.data.forEach(r => prevDataMap.set(String(r.strikePrice), r));

            let hasOIDifference = false;
            const newRecords = dataPayload.records?.data || [];

            // Get Spot Price to focus detection on relevant strikes
            const spotPrice = dataPayload.records?.underlyingValue || 0;
            const rangeLimit = 300; // Check +/- 300 points (approx 6-10 strikes) - STRICTER

            for (const curr of newRecords) {
                // SKIP strikes that are too far away (Deep OTM/ITM noise)
                if (spotPrice > 0 && Math.abs(curr.strikePrice - spotPrice) > rangeLimit) {
                    continue;
                }

                const prev = prevDataMap.get(String(curr.strikePrice));
                if (prev) {
                    const prevCE_OI = prev.CE?.openInterest || 0;
                    const currCE_OI = curr.CE?.openInterest || 0;
                    const prevPE_OI = prev.PE?.openInterest || 0;
                    const currPE_OI = curr.PE?.openInterest || 0;

                    // STRICTLY check only OI (Open Interest). Ignore LTP, Volume, etc.
                    // Also ignore tiny changes (noise) < 5 contracts
                    if (Math.abs(prevCE_OI - currCE_OI) > 5) {
                        hasOIDifference = true;
                        // console.log(`[${symbol}] Save Trigger: Strike ${curr.strikePrice} CE OI changed ${prevCE_OI} -> ${currCE_OI}`);
                        break;
                    }
                    if (Math.abs(prevPE_OI - currPE_OI) > 5) {
                        hasOIDifference = true;
                        // console.log(`[${symbol}] Save Trigger: Strike ${curr.strikePrice} PE OI changed ${prevPE_OI} -> ${currPE_OI}`);
                        break;
                    }
                } else {
                    // New meaningful strike appeared (Must have significant OI)
                    if ((curr.CE?.openInterest || 0) > 100 || (curr.PE?.openInterest || 0) > 100) {
                        hasOIDifference = true;
                        // console.log(`[${symbol}] Save Trigger: New Strike ${curr.strikePrice} appeared with significant OI`);
                        break;
                    }
                }
            }

            if (!hasOIDifference) {
                // console.log(`[${symbol}] No OI difference found in any strike. Skipping DB Save.`);
                return { status: 'no_change' };
            }
        }

        // 2. Compute Difference
        if (lastRecord && lastRecord.data && lastRecord.data.records && lastRecord.data.records.data) {
            const prevDataMap = new Map();
            // Use String(strikePrice) to avoid type mismatches
            lastRecord.data.records.data.forEach(r => prevDataMap.set(String(r.strikePrice), r));

            // Modify the NEW data in place (it's a JS object)
            // We prioritize records.data
            if (dataPayload.records && dataPayload.records.data) {
                dataPayload.records.data.forEach(curr => {
                    const prev = prevDataMap.get(String(curr.strikePrice));
                    if (prev) {
                        if (curr.CE) {
                            curr.CE.diffOpenInterest = (curr.CE.openInterest || 0) - (prev.CE.openInterest || 0);
                            curr.CE.diffTotalTradedVolume = (curr.CE.totalTradedVolume || 0) - (prev.CE.totalTradedVolume || 0);
                        }
                        if (curr.PE) {
                            curr.PE.diffOpenInterest = (curr.PE.openInterest || 0) - (prev.PE.openInterest || 0);
                            curr.PE.diffTotalTradedVolume = (curr.PE.totalTradedVolume || 0) - (prev.PE.totalTradedVolume || 0);
                        }
                    } else {
                        // New strike or no prev data, diff is 0
                        if (curr.CE) {
                            curr.CE.diffOpenInterest = 0;
                            curr.CE.diffTotalTradedVolume = 0;
                        }
                        if (curr.PE) {
                            curr.PE.diffOpenInterest = 0;
                            curr.PE.diffTotalTradedVolume = 0;
                        }
                    }
                });
            }

            // Also update filtered.data because Frontend uses it for 'Current Snapshot' table sometimes
            if (dataPayload.filtered && dataPayload.filtered.data) {
                dataPayload.filtered.data.forEach(curr => {
                    const prev = prevDataMap.get(String(curr.strikePrice));
                    if (prev) {
                        if (curr.CE) {
                            curr.CE.diffOpenInterest = (curr.CE.openInterest || 0) - (prev.CE.openInterest || 0);
                            curr.CE.diffTotalTradedVolume = (curr.CE.totalTradedVolume || 0) - (prev.CE.totalTradedVolume || 0);
                        }
                        if (curr.PE) {
                            curr.PE.diffOpenInterest = (curr.PE.openInterest || 0) - (prev.PE.openInterest || 0);
                            curr.PE.diffTotalTradedVolume = (curr.PE.totalTradedVolume || 0) - (prev.PE.totalTradedVolume || 0);
                        }
                    }
                });
            }
        } else {
            // First record ever, init diffs to 0
            if (dataPayload.records && dataPayload.records.data) {
                dataPayload.records.data.forEach(curr => {
                    if (curr.CE) {
                        curr.CE.diffOpenInterest = 0;
                        curr.CE.diffTotalTradedVolume = 0;
                    }
                    if (curr.PE) {
                        curr.PE.diffOpenInterest = 0;
                        curr.PE.diffTotalTradedVolume = 0;
                    }
                });
            }
            if (dataPayload.filtered && dataPayload.filtered.data) {
                dataPayload.filtered.data.forEach(curr => {
                    if (curr.CE) {
                        curr.CE.diffOpenInterest = 0;
                        curr.CE.diffTotalTradedVolume = 0;
                    }
                    if (curr.PE) {
                        curr.PE.diffOpenInterest = 0;
                        curr.PE.diffTotalTradedVolume = 0;
                    }
                });
            }
        }

        // 3. Save
        const newData = new OIData({
            symbol: symbol,
            timestamp: new Date(),
            data: dataPayload
        });
        await newData.save();
        // console.log(`Saved to DB with computed differences for ${symbol}`);

        // Return the filtered data for comparison
        return dataPayload.filtered;
    } catch (err) {
        console.error('Error saving data with diff:', err);
        return null;
    }
};

module.exports = { fetchNSEData, closeBrowser };
