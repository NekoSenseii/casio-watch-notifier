# Casio Watch Stock Monitor Bot 🎯

## 1. Title and Description
A Telegram bot that automatically monitors the Casio AE-1200WHL-5AVDF watch stock on casiostore.bhawar.com and sends instant notifications when it becomes available.

## 2. Badges

![Node.js](https://img.shields.io/badge/node.js-%2343853D.svg?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)
![Render](https://img.shields.io/badge/Render-%46E3B7.svg?style=for-the-badge&logo=render&logoColor=white)

## 3. Features
- ✅ **24/7 Monitoring** - Checks stock every 2.5 minutes automatically
- ✅ **Instant Alerts** - Telegram notifications when watch is back in stock  
- ✅ **Bot Commands** - `/status` and `/check` commands
- ✅ **Free Hosting** - Runs on Render's free tier
- ✅ **Self-Healing** - Self-ping mechanism prevents server sleep
- ✅ **Smart Detection** - Finds "out of stock" vs "add to cart" text
- ✅ **Polling-Based** - Stable connection without webhook issues

## 4. Tech
Built With:
- [Node.js](https://nodejs.org/) - Runtime environment
- [Express](https://expressjs.com/) - Web framework  
- [Telegraf](https://telegraf.js.org/) - Telegram Bot Framework
- [node-fetch](https://github.com/node-fetch/node-fetch) - HTTP client for web scraping
- [Render](https://render.com/) - Cloud hosting platform

## 5. Installation
#### Prerequisites
- Node.js 18+ installed
- Telegram account
- GitHub account (for deployment)
#### Local Setup
-> **Clone the repository**
- git clone https://github.com/yourusername/casio-watch-notifier.git
- cd casio-watch-notifier

-> **Install dependencies**
- npm install


-> **Set up environment variables**
   
   - Copy `.env.example` to `.env` and fill in your values:
    TELEGRAM_BOT_TOKEN=your_bot_token_here
    TELEGRAM_CHAT_ID=your_chat_id_here
    PORT=3000
## 6. Environment Variables

To run this project, you will need to add the following environment variables:

`TELEGRAM_BOT_TOKEN` - Get from @BotFather on Telegram

`TELEGRAM_CHAT_ID` - Your Telegram chat ID (use /getUpdates method)

`PORT` - Server port (default: 3000)

**Getting your Bot Token:**
- Message @BotFather on Telegram
- Use `/newbot` command
- Follow instructions and copy the token

**Getting your Chat ID:**
- Start a chat with your bot
- Visit: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
- Copy the `chat.id` from the response

## 7. Run Locally
#### Install dependencies
    npm install

#### Create .env file from template
    cp .env.example .env

#### Edit .env with your credentials
        nano .env

#### Start the application
    npm start
## 8. Deployment

### Deploy on Render (Free)

1. **Fork this repository** to your GitHub account

2. **Create new Web Service** on [Render](https://render.com)

3. **Connect your repository** and configure:
- **Build Command**: `npm install`
- **Start Command**: `npm start`

4. **Add Environment Variables**:
- `TELEGRAM_BOT_TOKEN`: Your bot token
- `TELEGRAM_CHAT_ID`: Your chat ID

5. **Deploy** and your bot will be live 24/7!

### Alternative Platforms
- **Railway** - Free 500 hours/month
- **Fly.io** - Free tier available  
- **Replit** - Always-on for $5/month

## 9. Usage/Examples

### Bot Commands

Once deployed, use these commands in Telegram:

**Check Status:**

    /status

*Shows bot uptime, stock status, and monitoring info*

**Manual Check:**

    /check

*Immediately checks current stock status*

### Automatic Notifications

The bot automatically sends alerts like this when stock is found:

    🎉 STOCK ALERT!

    ✅ Casio AE-1200WHL-5AVDF is back in stock!

    🛒 Buy now: [Product Link]

    💰 Price: Check website for current price
    ⏰ Checked at: 29/8/2025, 12:30:00 PM

    ⚡ Hurry! Limited stock available

## 10. Contributing

Contributions are what make the open source community amazing! Any contributions you make are **greatly appreciated**.

->  Fork the Project

-> Create your Feature Branch (`git checkout -b feature/AmazingFeature`)

-> Commit your Changes (`git commit -m 'Add some AmazingFeature'`)

-> Push to the Branch (`git push origin feature/AmazingFeature`)

-> Open a Pull Request

### Ideas for Contributions:
- Add support for multiple products
- Create web dashboard
- Add price tracking
- Support more stores
- Add more notification channels

## 11. License

Distributed under the MIT License. See `LICENSE` for more information.

You are free to:
- Use commercially
- Modify  
- Distribute
- Place warranty

## 12. Authors
- [@NekoSenseii](https://github.com/NekoSenseii) - Initial work

See also the list of [contributors](https://github.com/yourusername/casio-watch-notifier/contributors) who participated in this project.

## 13. Acknowledgements

- [Telegraf.js](https://telegraf.js.org/) - Amazing Telegram bot framework
- [Render](https://render.com/) - Free hosting platform
- [readme.so](https://readme.so) - README template generator
- [Shields.io](https://shields.io/) - Beautiful badges
- [@BotFather](https://t.me/botfather) - Telegram's bot creation tool


## 14. Support

If this project helped you, please consider:

- ⭐ **Star this repository**
- 🐛 **Report issues** in the Issues tab
- 💡 **Suggest features** via Issues
- 🔄 **Share with others** who might find it useful

**Need help?** 
- Create an [issue](https://github.com/yourusername/casio-watch-notifier/issues)
- Check existing [discussions](https://github.com/yourusername/casio-watch-notifier/discussions)

⚠️ **Disclaimer**: This bot is for personal use only. Please respect the website's terms of service.
