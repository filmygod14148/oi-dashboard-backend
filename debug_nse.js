const axios = require('axios');

const NSE_URL = 'https://www.nseindia.com/api/option-chain-indices?symbol=';
const BASE_URL = 'https://www.nseindia.com';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchNSEData = async (symbol) => {
    try {
        const headers = {
            'authority': 'www.nseindia.com',
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'referer': 'https://www.nseindia.com/option-chain',
        };

        console.log('Step 1: Visiting Homepage for Cookies...');
        const responseFirst = await axios.get(BASE_URL, {
            headers: {
                ...headers,
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'upgrade-insecure-requests': '1',
            }
        });

        const cookies = responseFirst.headers['set-cookie'];
        console.log('Cookies received count:', cookies ? cookies.length : 'None');

        let cookieString = '';
        if (cookies) {
            // Extract relevant cookies
            cookieString = cookies.map(c => c.split(';')[0]).join('; ');
        }

        // NSE seems to care about specific cookies order or presence? 
        // passing all set-cookies back usually works.

        await sleep(1000);

        console.log(`Step 2: Fetching API for ${symbol}...`);

        const responseData = await axios.get(`${NSE_URL}${symbol}`, {
            headers: {
                ...headers,
                'cookie': cookieString,
                'x-requested-with': 'XMLHttpRequest',
                // 'sec-fetch-dest': 'empty',
                // 'sec-fetch-mode': 'cors',
                // 'sec-fetch-site': 'same-origin',
            }
        });

        console.log('Response Status:', responseData.status);
        if (responseData.data && responseData.data.records) {
            console.log('SUCCESS: Records found.');
            console.log('Underlying Value:', responseData.data.records.underlyingValue);
        } else {
            console.log('FAILURE: Records not found.');
            console.log('Keys:', Object.keys(responseData.data));
        }

    } catch (error) {
        console.error('Error fetching data from NSE:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data Sample:', typeof error.response.data === 'string' ? error.response.data.substring(0, 100) : 'Object');
        }
    }
};

fetchNSEData('NIFTY');
