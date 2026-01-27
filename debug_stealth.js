const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const NSE_URL = 'https://www.nseindia.com/api/option-chain-indices?symbol=';
const OPTION_CHAIN_URL = 'https://www.nseindia.com/option-chain';

(async () => {
    let browser;
    try {
        console.log('Launching browser...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log('Goto Option Chain...');
        await page.goto(OPTION_CHAIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('Waiting 3s...');
        await new Promise(r => setTimeout(r, 3000));

        console.log('Fetching NIFTY data...');
        const responseData = await page.evaluate(async (url) => {
            try {
                const response = await fetch(url, {
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                });
                return await response.json();
            } catch (err) {
                return { error: err.toString() };
            }
        }, `${NSE_URL}NIFTY`);

        if (responseData && responseData.records) {
            console.log('SUCCESS: records found!');
            console.log('Expiry Dates:', responseData.records.expiryDates.slice(0, 3));
        } else {
            console.log('FAILURE: Response:', responseData ? Object.keys(responseData) : 'null');
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        if (browser) await browser.close();
    }
})();
