const puppeteer = require('puppeteer');

const NSE_URL = 'https://www.nseindia.com/api/option-chain-indices?symbol=';
const BASE_URL = 'https://www.nseindia.com';

const fetchNSEData = async (symbol) => {
    let browser;
    try {
        console.log('Launching browser...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('Visiting Home...');
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log(`Going to API for ${symbol}...`);
        await page.goto(`${NSE_URL}${symbol}`, { waitUntil: 'networkidle2', timeout: 60000 });

        const content = await page.evaluate(() => document.body.innerText);

        try {
            const json = JSON.parse(content);
            if (json.records) {
                console.log('SUCCESS: Records found.');
                console.log('Underlying:', json.records.underlyingValue);
            } else {
                console.log('FAILURE: Records missing. Content:', content.substring(0, 100));
            }
        } catch (e) {
            console.log('Failed to parse JSON.');
            console.log('Content start:', content.substring(0, 200));
        }

    } catch (error) {
        console.error('Error with puppeteer:', error);
    } finally {
        if (browser) await browser.close();
    }
};

fetchNSEData('NIFTY');
