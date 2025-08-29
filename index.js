import express from "express";
import fetch from "node-fetch";
import { Telegraf } from "telegraf";

const app = express();
app.use(express.json());

// Environment variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

// Verify environment variables
if (!BOT_TOKEN || !CHAT_ID || !WEBHOOK_URL) {
  console.error("❌ Missing required environment variables!");
  process.exit(1);
}

// Initialize the bot
const bot = new Telegraf(BOT_TOKEN);

// Track last stock status
let lastStockStatus = 'unknown';

// Health check route for pinging to prevent sleep
app.get("/", (req, res) => {
  res.json({
    status: "Bot is running!",
    uptime: process.uptime(),
    lastCheck: new Date().toISOString(),
    stockStatus: lastStockStatus
  });
});

// Function to scrape stock page
async function checkStock() {
  const timestamp = new Date().toISOString();
  try {
    console.log(`[${timestamp}] 🔍 Checking Casio AE-1200WHL-5AVDF stock...`);
    const response = await fetch("https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383", {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    }
    const html = await response.text();
    console.log(`[${timestamp}] 📡 Page fetched successfully`);
    const inStock = checkStockFromHTML(html);
    if (inStock) {
      console.log(`[${timestamp}] ✅ Stock is available!`);
      if (lastStockStatus !== 'available') {
        lastStockStatus = 'available';
        await sendStockNotification();
      }
    } else {
      console.log(`[${timestamp}] ⏳ Still sold out or unavailable`);
      lastStockStatus = 'sold_out';
    }
  } catch (error) {
    console.error(`[${timestamp}] ❌ Error checking stock:`, error.message);
  }
}

// Parse HTML for stock status
function checkStockFromHTML(html) {
  const lowerHtml = html.toLowerCase();
  const inStockKeywords = [
    'add to cart', 'add to bag', 'buy now', 'in stock', 'available', 'addtocart'
  ];
  const outOfStockKeywords = [
    'out of stock', 'sold out', 'unavailable', 'notify when available', 'out-of-stock', 'soldout', 'preorder', 'pre-order'
  ];
  for (const word of outOfStockKeywords) {
    if (lowerHtml.includes(word)) {
      console.log(`📋 Found out-of-stock indicator: "${word}"`);
      return false;
    }
  }
  for (const word of inStockKeywords) {
    if (lowerHtml.includes(word)) {
      console.log(`📋 Found in-stock indicator: "${word}"`);
      return true;
    }
  }
  console.log('📋 No clear stock indicators found, assuming out of stock');
  return false;
}

// Notify Telegram channel/group
async function sendStockNotification() {
  try {
    const message = `🎉 **STOCK ALERT!**\n\n✅ Casio AE-1200WHL-5AVDF is back in stock!\n\n🛒 **Buy now:** [https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383](https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383)\n\n💰 **Price:** Check website for current price\n⏰ **Checked at:** ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n⚡ **Hurry! Limited stock available**`;
    await bot.telegram.sendMessage(CHAT_ID, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    });
    console.log('✅ Stock notification sent successfully!');
  } catch (err) {
    console.error('❌ Failed to send stock notification:', err.message);
  }
}

// Keep the app alive
function keepAlive() {
  fetch(WEBHOOK_URL)
    .then(res => console.log(`🏓 Self-ping successful: ${res.status}`))
    .catch(err => console.log(`🏓 Self-ping failed: ${err.message}`));
}

// Webhook path
const webhookPath = '/bot';

// Setup webhook
async function setupWebhook() {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    console.log('🗑️ Old webhook deleted');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await bot.telegram.setWebhook(`${WEBHOOK_URL}${webhookPath}`);
    console.log(`✅ Webhook set up: ${WEBHOOK_URL}${webhookPath}`);
  } catch (err) {
    console.error('❌ Webhook setup failed:', err.message);
  }
}

app.use(webhookPath, bot.webhookCallback(webhookPath));

// Bot commands
bot.command('status', async ctx => {
  const uptime = Math.floor(process.uptime() / 60);
  const message = `🤖 **Bot Status**\n\n✅ Running for ${uptime} minutes\n📊 Stock Status: ${lastStockStatus}\n⏰ Last Check: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n🎯 Monitoring: Casio AE-1200WHL-5AVDF\n⚡ Check Interval: Every 2.5 minutes`;
  await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('check', async ctx => {
  await ctx.reply('🔍 Checking stock now...');
  await checkStock();
  await ctx.reply(`Stock status: ${lastStockStatus}`);
});

// Schedule stock check every 2.5 minutes
setInterval(checkStock, 150000);

// Schedule self-ping every 10 minutes
setInterval(keepAlive, 600000);

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Webhook URL: ${WEBHOOK_URL}${webhookPath}`);

  await setupWebhook();

  try {
    await bot.telegram.sendMessage(CHAT_ID, `🤖 **Casio Stock Bot Started!**\n\n✅ Now monitoring: AE-1200WHL-5AVDF\n🌐 Store: casiostore.bhawar.com\n⏰ Started at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n🔄 Check interval: Every 2.5 minutes\n🏓 Self-ping: Every 10 minutes`, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('❌ Startup notification failed:', err.message);
  }

  console.log('🔍 Starting stock monitoring for Casio AE-1200WHL-5AVDF...');
  console.log('⚡ Checking every 2.5 minutes');

  setTimeout(checkStock, 5000); // Initial stock check after 5 seconds
  setTimeout(() => {
    console.log('🏓 Starting self-ping to prevent sleep...');
    keepAlive();
  }, 10000);
});
