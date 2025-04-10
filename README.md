Faucet 0G Bot
A Node.js script to automate claiming tokens from the 0G Faucet (https://faucet.0g.ai) using multiple wallets and proxies, with hCaptcha solving via 2Captcha.

Mô tả (Description)
Tiếng Việt: Đây là một chương trình tự động hóa việc yêu cầu token từ Faucet 0G (https://faucet.0g.ai). Chương trình sử dụng danh sách ví Ethereum và proxy để gửi yêu cầu, đồng thời giải hCaptcha thông qua dịch vụ 2Captcha. Bạn có thể cấu hình ngôn ngữ log (tiếng Việt hoặc tiếng Anh) thông qua tệp .env.

English: This is an automation script for claiming tokens from the 0G Faucet (https://faucet.0g.ai). It uses a list of Ethereum wallets and proxies to make requests and solves hCaptcha using the 2Captcha service. Log language (Vietnamese or English) can be configured via the .env file.

Features
Supports multiple Ethereum wallets and proxies.
Automatically solves hCaptcha using 2Captcha API.
Configurable log language (Vietnamese or English).
Retry mechanism for failed requests.
Colorful console output using chalk.
Prerequisites
Node.js: Version 14.x or higher.
npm: For installing dependencies.
A valid 2Captcha API Key (get it from 2captcha.com).
A list of Ethereum wallet addresses and HTTP proxies.
Installation
Clone or download this repository:
```bash
git clone <repository-url>
cd crazyscholar-faucet-0g-bot
```
Install dependencies:  
```bash
 npm install
 ```
Create a .env file in the root directory with the following content:
```bash
CAPTCHA_API_KEY=your_2captcha_api_key_here
LANGUAGE=vi  # Use "vi" for Vietnamese, "en" for English
``` 
Prepare input files:
wallet.txt: A list of Ethereum wallet addresses (one per line, e.g., 0x123...).
proxy.txt: A list of HTTP proxies (one per line, e.g., http://user:pass@ip:port).
Usage
Run the script:
```bash
node index.js
```
The script will load wallets and proxies, solve hCaptcha for each wallet, and claim tokens from the faucet.
Logs will display in the language specified in .env (vi or en).
Example Files
wallet.txt:
```bash
0x1234567890abcdef1234567890abcdef12345678
0xabcdef1234567890abcdef1234567890abcdef12
```
proxy.txt:
```bash
http://user1:pass1@192.168.1.1:8080
http://user2:pass2@10.0.0.1:3128
```
Configuration
Edit the .env file to customize:
```bash
CAPTCHA_API_KEY: Your 2Captcha API key.
LANGUAGE: Set to vi (Vietnamese) or en (English).
```
Dependencies
axios: For HTTP requests.
https-proxy-agent: For proxy support.
chalk: For colored console logs.
dotenv: For loading environment variables from .env.
fs: Built-in Node.js module for file operations.
### Install them with:
```bassh
npm install axios https-proxy-agent chalk dotenv
```
### Notes
Ensure your proxies are working and support HTTPS.
Add .env to .gitignore to keep your API key secure.
The script retries failed requests up to 5 times for faucet claims and 3 times for other requests.
If a CAPTCHA fails, it will attempt to resolve a new one before skipping the wallet.
Troubleshooting
"CAPTCHA_API_KEY is not defined": Check your .env file.
No wallets/proxies found: Ensure wallet.txt and proxy.txt exist and are formatted correctly.
Request timeout: Verify your proxies or internet connection.
License
This project is unlicensed. Use it at your own risk.

### Author
## Created by Crazyscholar.# Faucet_0G
<<<<<<< HEAD
# Faucet_0G
=======

