const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const URL = 'https://www.nseindia.com/option-chain';

(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--window-size=1920,1080'] }); // Full HD
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('Visiting...');
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    try {
        await page.waitForSelector('#optionChainTable-indices', { timeout: 15000 });
        console.log('Table found.');

        const info = await page.evaluate(() => {
            const table = document.querySelector('#optionChainTable-indices');
            const headers = Array.from(table.querySelectorAll('thead tr:nth-child(2) th')).map(th => th.innerText.trim());

            // Get first data row
            const rows = Array.from(table.querySelectorAll('tbody tr'));
            const midRow = rows[Math.floor(rows.length / 2)];
            const cols = Array.from(midRow.querySelectorAll('td')).map(td => td.innerText.trim());

            // Find Timestamp
            const timeEl = document.querySelector('#asondate') || document.querySelector('.run_time') || document.querySelector('span[id*="time"]');
            const timestamp = timeEl ? timeEl.innerText : 'Timestamp not found';

            return { headers, rowSample: cols, timestamp };
        });

        console.log('Headers:', info.headers);
        console.log('Page Timestamp:', info.timestamp);
        console.log('Row Sample length:', info.rowSample.length);
        console.log('Row Sample first 5:', info.rowSample.slice(0, 5));

    } catch (e) {
        console.error(e.message);
    }

    await browser.close();
})();
