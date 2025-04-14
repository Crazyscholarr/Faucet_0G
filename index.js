require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const chalk = require('chalk');
const async = require('async');

const FAUCET_URL = 'https://hub.0g.ai/faucet'; // Chỉ sử dụng trang phụ
const SITE_KEY = '1230eb62-f50c-4da4-a736-da5c3c342e8e'; // Chỉ sử dụng site key của trang phụ
const FALLBACK_FAUCET_URL = 'https://hub.0g.ai/faucet';
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY;
const FALLBACK_SITE_KEY = '1230eb62-f50c-4da4-a736-da5c3c342e8e';
const PROXY_LIST_FILE = 'proxy.txt';
const WALLET_LIST_FILE = 'wallet.txt';
const LANGUAGE = process.env.LANGUAGE || 'vi';
const MAX_THREADS = parseInt(process.env.MAX_THREADS) || 3;
const MAX_WALLETS = parseInt(process.env.MAX_WALLETS) || 0;
const CAPTCHA_MAX_ATTEMPTS = parseInt(process.env.CAPTCHA_MAX_ATTEMPTS) || 20;
const CAPTCHA_WAIT_INTERVAL = parseInt(process.env.CAPTCHA_WAIT_INTERVAL) || 5000;

const HEADERS = {
    'Accept': '*/*',
    'Content-Type': 'application/json',
    'Origin': 'https://faucet.0g.ai',
    'Referer': 'https://faucet.0g.ai/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0'
};

const FALLBACK_HEADERS = {
    'Accept': '*/*',
    'Content-Type': 'application/json;charset=UTF-8',
    'Origin': 'https://hub.0g.ai',
    'Referer': 'https://hub.0g.ai/faucet',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0',
    'sec-ch-ua': '"Microsoft Edge";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin'
};

// Biến toàn cục để theo dõi trạng thái faucet
let useFallbackFaucet = false;

// Kiểm tra biến môi trường
if (!CAPTCHA_API_KEY) {
    console.log(chalk.red('CAPTCHA_API_KEY is not defined in the .env file! / CAPTCHA_API_KEY chưa được định nghĩa trong tệp .env!'));
    process.exit(1);
}

// Tải danh sách ví và proxy
const loadWallets = () => {
    if (!fs.existsSync(WALLET_LIST_FILE)) {
        console.log(chalk.red(`File ${WALLET_LIST_FILE} does not exist. Please create it and add wallet addresses! / File ${WALLET_LIST_FILE} không tồn tại. Vui lòng tạo file và thêm địa chỉ ví!`));
        process.exit(1);
    }
    let wallets = fs.readFileSync(WALLET_LIST_FILE, 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && /^0x[a-fA-F0-9]{40}$/.test(line));
    if (wallets.length === 0) {
        console.log(chalk.red(`No valid wallet addresses found in ${WALLET_LIST_FILE}! Format must be 0x followed by 40 hex characters! / Không tìm thấy địa chỉ ví hợp lệ trong ${WALLET_LIST_FILE}. Định dạng phải là 0x theo sau bởi 40 ký tự hex!`));
        process.exit(1);
    }
    if (MAX_WALLETS > 0 && wallets.length > MAX_WALLETS) {
        wallets = wallets.slice(0, MAX_WALLETS);
        console.log(chalk.yellow(`Giới hạn số ví chạy: ${MAX_WALLETS} / Limited to ${MAX_WALLETS} wallets`));
    }
    return wallets;
};

const loadProxies = () => {
    if (!fs.existsSync(PROXY_LIST_FILE)) {
        console.log(chalk.red(`File ${PROXY_LIST_FILE} does not exist. Please create it and add proxies! / File ${PROXY_LIST_FILE} không tồn tại. Vui lòng tạo file và thêm proxy!`));
        process.exit(1);
    }
    const proxies = fs.readFileSync(PROXY_LIST_FILE, 'utf-8')
        .split('\n')
        .map(p => p.trim())
        .filter(p => p && p.startsWith('http'));
    if (proxies.length === 0) {
        console.log(chalk.red(`No valid proxies found in ${PROXY_LIST_FILE}! / Không tìm thấy proxy nào hợp lệ trong ${PROXY_LIST_FILE}!`));
        process.exit(1);
    }
    return proxies;
};

const assignProxiesToWallets = (wallets, proxies) => wallets.map((address, index) => ({
    address,
    proxy: proxies[index % proxies.length] || null
}));

const getIpFromProxy = async (proxy) => {
    if (!proxy) return "N/A";
    const config = { httpsAgent: new HttpsProxyAgent(proxy), timeout: 10000 };
    try {
        const response = await axios.get("https://api.ipify.org?format=json", config);
        return response.data.ip;
    } catch {
        return "Unknown";
    }
};

const getFormattedTime = () => {
    const now = new Date();
    const time = now.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const day = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `[${time} | ${day}]`;
};

// Hàm log song ngữ
const logMessage = (walletIndex, messageVi, messageEn, ip) => {
    const timestamp = getFormattedTime();
    const walletLabel = LANGUAGE === 'vi' ? `Ví ${walletIndex + 1}` : `Wallet ${walletIndex + 1}`;
    const logText = LANGUAGE === 'vi' ? messageVi : messageEn;
    console.log(
        `${chalk.cyan(timestamp)} ` +
        `${chalk.magenta('[Crazyscholar @ Faucet 0G]')} ` +
        `${chalk.yellow(`[${walletLabel}]`)} | ` +
        `${logText} - ${chalk.cyan(ip)}`
    );
};

const printTitle = () => {
    const timestamp = getFormattedTime();
    console.log(chalk.bold.green(
        `====================================================================\n` +
        `${timestamp} Crazyscholar Faucet 0G Bot - v2.3\n` +
        `====================================================================\n` +
        `Số luồng: ${MAX_THREADS} | Số ví tối đa: ${MAX_WALLETS || 'Tất cả'} / Threads: ${MAX_THREADS} | Max wallets: ${MAX_WALLETS || 'All'}\n` +
        `====================================================================`
    ));
};

const makeRequest = async (url, options = {}, proxy, retries = url === FAUCET_URL || url === FALLBACK_FAUCET_URL ? 5 : 3) => {
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
    let lastError;

    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios({
                url,
                ...options,
                httpsAgent: agent,
                timeout: 120000
            });
            return response;
        } catch (error) {
            lastError = error;
            const errorMsg = error.response?.data?.message || error.message;
            if (errorMsg.includes("Please wait") && (url === FAUCET_URL || url === FALLBACK_FAUCET_URL)) throw error;
            if (errorMsg.includes("status code 407")) {
                logMessage(options.walletIndex, `Proxy lỗi 407. Bỏ qua ví này...`, `Proxy error 407. Skipping this wallet...`, options.ip);
                throw error;
            }
            if (i < retries - 1) {
                logMessage(
                    options.walletIndex,
                    `Lỗi: "${errorMsg}". Thử lại sau 5s, còn ${retries - i - 1} lần...`,
                    `Error: "${errorMsg}". Retrying in 5s, ${retries - i - 1} attempts left...`,
                    options.ip
                );
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
    throw lastError;
};

const solveCaptcha = async (walletIndex, proxy, ip, faucetUrl, siteKey) => {
    try {
        const pageUrl = faucetUrl.includes('hub.0g.ai') ? 'https://hub.0g.ai' : 'https://faucet.0g.ai';
        const faucetName = faucetUrl.includes('hub.0g.ai') ? 'hub.0g.ai' : 'faucet.0g.ai';
        const sendResponse = await makeRequest(
            `http://2captcha.com/in.php?key=${CAPTCHA_API_KEY}&method=hcaptcha&sitekey=${siteKey}&pageurl=${pageUrl}&json=1`,
            { method: 'GET', walletIndex, ip },
            proxy
        );
        if (sendResponse.data.status !== 1) throw new Error('Gửi CAPTCHA thất bại / Failed to submit CAPTCHA');

        const requestId = sendResponse.data.request;
        logMessage(walletIndex, `Đã gửi CAPTCHA cho ${faucetName}, ID: ${requestId}`, `CAPTCHA submitted for ${faucetName}, ID: ${requestId}`, ip);

        for (let i = 0; i < CAPTCHA_MAX_ATTEMPTS; i++) {
            await new Promise(resolve => setTimeout(resolve, CAPTCHA_WAIT_INTERVAL));
            const result = await makeRequest(
                `http://2captcha.com/res.php?key=${CAPTCHA_API_KEY}&action=get&id=${requestId}&json=1`,
                { method: 'GET', walletIndex, ip },
                proxy
            );
            if (result.data.status === 1) {
                logMessage(walletIndex, `Giải CAPTCHA thành công cho ${faucetName}`, `CAPTCHA solved successfully for ${faucetName}`, ip);
                return result.data.request;
            }
            logMessage(walletIndex, `Đang chờ giải CAPTCHA cho ${faucetName}...`, `Waiting for CAPTCHA to be solved for ${faucetName}...`, ip);
        }
        throw new Error('Hết thời gian chờ giải CAPTCHA / CAPTCHA solving timed out');
    } catch (error) {
        const faucetName = faucetUrl.includes('hub.0g.ai') ? 'hub.0g.ai' : 'faucet.0g.ai';
        logMessage(walletIndex, `Lỗi giải CAPTCHA cho ${faucetName}: ${error.message}`, `CAPTCHA solving error for ${faucetName}: ${error.message}`, ip);
        return null;
    }
};

const claimFaucet = async (walletIndex, walletAddress, hcaptchaToken, proxy, ip) => {
    try {
        const headers = FALLBACK_HEADERS; // Sử dụng header của trang phụ
        const faucetName = 'hub.0g.ai';
        const payload = { walletAddress, hcaptcha: hcaptchaToken };

        const response = await makeRequest(
            FAUCET_URL,
            {
                method: 'POST',
                headers,
                data: payload,
                walletIndex,
                ip
            },
            proxy
        );

        // Chỉ in kết quả thành công hoặc thất bại
        console.log(
            response && !response.error
                ? chalk.blue('Faucet thành công')
                : chalk.red('Faucet thất bại')
        );

        return response.data;
    } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;

        // Nếu lỗi là "Invalid Captcha", yêu cầu giải lại CAPTCHA
        if (errorMsg.includes('Invalid Captcha')) {
            logMessage(walletIndex, 
                'CAPTCHA không hợp lệ. Đang tải lại trang và giải lại CAPTCHA...', 
                'Invalid CAPTCHA. Reloading page and solving CAPTCHA again...', 
                ip
            );
            return { error: 'Invalid Captcha' };
        }

        console.log(chalk.red('Faucet thất bại'));
        return { error: errorMsg };
    }
};

const processWallet = async (walletInfo, index, callback) => {
    const { address: walletAddress, proxy } = walletInfo;
    const ip = await getIpFromProxy(proxy);
    logMessage(index, `Sử dụng ví: ${walletAddress}`, `Using wallet: ${walletAddress}`, ip);

    // Giải CAPTCHA
    let hcaptchaToken = await solveCaptcha(index, proxy, ip, FAUCET_URL, SITE_KEY);
    if (!hcaptchaToken) {
        logMessage(index, 'Không giải được CAPTCHA. Bỏ qua ví này...', 'Failed to solve CAPTCHA. Skipping this wallet...', ip);
        callback();
        return;
    }

    // Gửi yêu cầu faucet
    let response = await claimFaucet(index, walletAddress, hcaptchaToken, proxy, ip);

    // Nếu lỗi là "Invalid Captcha", giải lại CAPTCHA và thử lại
    while (response?.error === 'Invalid Captcha') {
        hcaptchaToken = await solveCaptcha(index, proxy, ip, FAUCET_URL, SITE_KEY);
        if (!hcaptchaToken) {
            logMessage(index, 'Không giải được CAPTCHA mới. Bỏ qua ví này...', 'Failed to solve new CAPTCHA. Skipping this wallet...', ip);
            break;
        }
        response = await claimFaucet(index, walletAddress, hcaptchaToken, proxy, ip);
    }

    logMessage(index, 'Đợi 10 giây trước khi hoàn tất...', 'Waiting 10 seconds before finishing...', ip);
    await new Promise(resolve => setTimeout(resolve, 10000));
    callback();
};

(async () => {
    printTitle();

    const wallets = loadWallets();
    const proxies = loadProxies();
    const walletProxyMap = assignProxiesToWallets(wallets, proxies);

    // Sử dụng async.queue để chạy đa luồng
    const queue = async.queue((walletInfo, callback) => {
        processWallet(walletInfo, walletProxyMap.indexOf(walletInfo), callback);
    }, MAX_THREADS);

    // Thêm tất cả ví vào hàng đợi
    walletProxyMap.forEach(walletInfo => queue.push(walletInfo));

    // Chờ tất cả ví xử lý xong
    await new Promise(resolve => {
        queue.drain(() => resolve());
    });

    console.log(chalk.green(LANGUAGE === 'vi' ? 'Đã hoàn thành tất cả yêu cầu!' : 'All requests completed!'));
})();
