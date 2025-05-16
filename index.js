require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const chalk = require('chalk');
const async = require('async');
const { Web3 } = require('web3'); // Correct import for web3 4.x
const tough = require('tough-cookie');

const FAUCET_URL = 'https://faucet.0g.ai/api/faucet';
const SITE_KEY = '914e63b4-ac20-4c24-bc92-cdb6950ccfde';
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY;
const PROXY_LIST_FILE = 'proxy.txt';
const WALLET_LIST_FILE = 'wallet.txt';
const TOKEN_LIST_FILE = 'tokenX.txt';
const LANGUAGE = process.env.LANGUAGE || 'vi';
const MAX_THREADS = parseInt(process.env.MAX_THREADS) || 3;
const MAX_WALLETS = parseInt(process.env.MAX_WALLETS) || 0;
const CAPTCHA_MAX_ATTEMPTS = parseInt(process.env.CAPTCHA_MAX_ATTEMPTS) || 20;
const CAPTCHA_WAIT_INTERVAL = parseInt(process.env.CAPTCHA_WAIT_INTERVAL) || 5000;
const WEB3_PROVIDER_URL = process.env.WEB3_PROVIDER_URL || 'https://rpc.0g.ai';

const FAUCET_CONTRACTS = {
    "USDT": "0x3eC8A8705bE1D5ca90066b37ba62c4183B024ebf",
    "ETH": "0x0fE9B43625fA7EdD663aDcEC0728DD635e4AbF7c",
    "BTC": "0x36f6414FF1df609214dDA71c84f18bcf00F67d" // Note: Incomplete address, needs correction
};

const CHAIN_ID = 16601;
const MINT_ABI = [
    {
        "name": "mint",
        "type": "function",
        "inputs": [],
        "outputs": [],
        "payable": true,
        "signature": "0x1249c58b",
        "stateMutability": "payable"
    }
];

const EXPLORER_URL_0G = "https://chainscan-galileo.0g.ai/tx/";
const EXPLORER_URLS = {
    "Arbitrum": "https://arbiscan.io/tx/",
    "Optimism": "https://optimistic.etherscan.io/tx/",
    "Base": "https://basescan.org/tx/",
    "Ethereum": "https://etherscan.io/tx/",
    "Galileo": "https://chainscan-galileo.0g.ai/tx/"
};

const HEADERS = {
    'Accept': '*/*',
    'Content-Type': 'application/json',
    'Origin': 'https://faucet.0g.ai',
    'Referer': 'https://faucet.0g.ai/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0',
    'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'accept-language': 'ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7,zh-TW;q=0.6,zh;q=0.5,uk;q=0.4'
};

if (!CAPTCHA_API_KEY) {
    console.log(chalk.red('CAPTCHA_API_KEY chưa được định nghĩa trong tệp .env!'));
    process.exit(1);
}

if (!WEB3_PROVIDER_URL) {
    console.log(chalk.red('WEB3_PROVIDER_URL chưa được định nghĩa trong tệp .env!'));
    process.exit(1);
}

const web3 = new Web3(WEB3_PROVIDER_URL); // Correct initialization for web3 4.x

const loadWallets = () => {
    if (!fs.existsSync(WALLET_LIST_FILE)) {
        console.log(chalk.red(`File ${WALLET_LIST_FILE} không tồn tại. Vui lòng tạo file và thêm địa chỉ ví và khóa riêng!`));
        process.exit(1);
    }
    let wallets = fs.readFileSync(WALLET_LIST_FILE, 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && /^0x[a-fA-F0-9]{40}:0x[a-fA-F0-9]+$/.test(line))
        .map(line => {
            const [address, privateKey] = line.split(':');
            return { address, privateKey };
        });
    if (wallets.length === 0) {
        console.log(chalk.red(`Không tìm thấy địa chỉ ví hợp lệ trong ${WALLET_LIST_FILE}. Định dạng phải là address:privateKey!`));
        process.exit(1);
    }
    if (MAX_WALLETS > 0 && wallets.length > MAX_WALLETS) {
        wallets = wallets.slice(0, MAX_WALLETS);
        console.log(chalk.yellow(`Giới hạn số ví chạy: ${MAX_WALLETS}`));
    }
    return wallets;
};

const loadTokens = () => {
    if (!fs.existsSync(TOKEN_LIST_FILE)) {
        console.log(chalk.red(`File ${TOKEN_LIST_FILE} không tồn tại. Vui lòng tạo file và thêm token!`));
        process.exit(1);
    }
    const tokens = fs.readFileSync(TOKEN_LIST_FILE, 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line);
    if (tokens.length === 0) {
        console.log(chalk.red(`Không tìm thấy token hợp lệ trong ${TOKEN_LIST_FILE}!`));
        process.exit(1);
    }
    return tokens;
};

const loadProxies = () => {
    if (!fs.existsSync(PROXY_LIST_FILE)) {
        console.log(chalk.yellow(`File ${PROXY_LIST_FILE} không tồn tại. Sẽ không sử dụng proxy.`));
        return [];
    }
    const proxies = fs.readFileSync(PROXY_LIST_FILE, 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && /^http(s)?:\/\/.+$/.test(line));
    return proxies;
};

const solveCaptcha = async (proxy) => {
    try {
        const twoCaptchaUrl = 'http://2captcha.com/in.php';
        const twoCaptchaCheckUrl = 'http://2captcha.com/res.php';
        const params = {
            key: CAPTCHA_API_KEY,
            method: 'hcaptcha',
            sitekey: SITE_KEY,
            pageurl: FAUCET_URL,
            json: 1
        };

        const agent = proxy ? new HttpsProxyAgent(proxy) : null;
        const axiosConfig = agent ? { httpsAgent: agent } : {};

        const response = await axios.post(twoCaptchaUrl, params, axiosConfig);
        if (response.data.status !== 1) {
            throw new Error(`Lỗi gửi CAPTCHA: ${response.data.request}`);
        }

        const captchaId = response.data.request;
        let attempts = 0;

        while (attempts < CAPTCHA_MAX_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, CAPTCHA_WAIT_INTERVAL));
            const checkResponse = await axios.get(`${twoCaptchaCheckUrl}?key=${CAPTCHA_API_KEY}&action=get&id=${captchaId}&json=1`, axiosConfig);
            if (checkResponse.data.status === 1) {
                return checkResponse.data.request;
            }
            if (checkResponse.data.request !== 'CAPCHA_NOT_READY') {
                throw new Error(`Lỗi kiểm tra CAPTCHA: ${checkResponse.data.request}`);
            }
            attempts++;
        }
        throw new Error('Hết số lần thử CAPTCHA.');
    } catch (error) {
        console.log(chalk.red(`Lỗi giải CAPTCHA: ${error.message}`));
        return null;
    }
};

const mintToken = async (wallet, tokenAddress, proxy) => {
    try {
        const account = web3.eth.accounts.privateKeyToAccount(wallet.privateKey);
        web3.eth.accounts.wallet.add(account);

        const contract = new web3.eth.Contract(MINT_ABI, tokenAddress);
        const gasPrice = await web3.eth.getGasPrice();
        const nonce = await web3.eth.getTransactionCount(wallet.address, 'pending');

        const tx = {
            from: wallet.address,
            to: tokenAddress,
            gas: 100000,
            gasPrice,
            nonce,
            data: contract.methods.mint().encodeABI(),
            chainId: CHAIN_ID
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, wallet.privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log(chalk.green(`Mint thành công cho ví ${wallet.address}: ${EXPLORER_URL_0G}${receipt.transactionHash}`));
        return true;
    } catch (error) {
        console.log(chalk.red(`Lỗi khi mint token cho ví ${wallet.address}: ${error.message}`));
        return false;
    }
};

const processWallet = async (wallet, tokens, proxies) => {
    const proxy = proxies.length > 0 ? proxies[Math.floor(Math.random() * proxies.length)] : null;
    console.log(chalk.blue(`Xử lý ví: ${wallet.address} ${proxy ? `với proxy ${proxy}` : ''}`));

    const captchaToken = await solveCaptcha(proxy);
    if (!captchaToken) {
        console.log(chalk.red(`Không thể giải CAPTCHA cho ví ${wallet.address}`));
        return;
    }

    for (const token of tokens) {
        const tokenAddress = FAUCET_CONTRACTS[token.toUpperCase()];
        if (!tokenAddress) {
            console.log(chalk.yellow(`Token ${token} không được hỗ trợ.`));
            continue;
        }

        const payload = {
            address: wallet.address,
            token: token.toUpperCase(),
            captcha: captchaToken
        };

        try {
            const agent = proxy ? new HttpsProxyAgent(proxy) : null;
            const axiosConfig = {
                headers: HEADERS,
                httpsAgent: agent
            };

            const response = await axios.post(FAUCET_URL, payload, axiosConfig);
            if (response.data.success) {
                console.log(chalk.green(`Yêu cầu faucet thành công cho ví ${wallet.address} với token ${token}`));
                const mintSuccess = await mintToken(wallet, tokenAddress, proxy);
                if (!mintSuccess) {
                    console.log(chalk.red(`Không thể mint token ${token} cho ví ${wallet.address}`));
                }
            } else {
                console.log(chalk.red(`Yêu cầu faucet thất bại cho ví ${wallet.address}: ${response.data.message}`));
            }
        } catch (error) {
            console.log(chalk.red(`Lỗi khi gửi yêu cầu faucet cho ví ${wallet.address}: ${error.message}`));
        }
    }
};

const main = async () => {
    console.log(chalk.cyan('Bắt đầu chạy bot faucet 0G...'));
    const wallets = loadWallets();
    const tokens = loadTokens();
    const proxies = loadProxies();

    console.log(chalk.cyan(`Tổng số ví: ${wallets.length}, Token: ${tokens.length}, Proxy: ${proxies.length}`));

    const queue = async.queue((task, callback) => {
        processWallet(task.wallet, task.tokens, task.proxies)
            .then(() => callback())
            .catch(err => {
                console.log(chalk.red(`Lỗi xử lý ví ${task.wallet.address}: ${err.message}`));
                callback();
            });
    }, MAX_THREADS);

    wallets.forEach(wallet => {
        queue.push({ wallet, tokens, proxies });
    });

    queue.drain(() => {
        console.log(chalk.green('Hoàn thành xử lý tất cả ví!'));
        process.exit(0);
    });
};

main().catch(err => {
    console.log(chalk.red(`Lỗi chính: ${err.message}`));
    process.exit(1);
});
