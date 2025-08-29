import express from "express";
import fetch from "node-fetch";
import { Telegraf } from "telegraf";

const app = express();
app.use(express.json());

// Environment variables  
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PORT = process.env.PORT || 3000;
const HEALTH_CHECK_KEY = process.env.HEALTH_CHECK_KEY;

// Verify environment variables
if (!BOT_TOKEN || !CHAT_ID) {
  console.error("❌ Missing required environment variables: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID!");
  process.exit(1);
}

if (!HEALTH_CHECK_KEY) {
  console.error("❌ HEALTH_CHECK_KEY environment variable is required!");
  process.exit(1);
}

// Initialize the bot
const bot = new Telegraf(BOT_TOKEN);

// Track last stock status and rate limiting
let lastStockStatus = 'unknown';
let lastHealthCheck = 0;

// Health check route with authentication and rate limiting
app.get("/", (req, res) => {
  // Simple rate limiting: max 1 request per 30 seconds
  const now = Date.now();
  if (now - lastHealthCheck < 30000) {
    return res.status(429).json({ error: "Too many requests" });
  }
  lastHealthCheck = now;

  const healthKey = req.query.key;
  if (healthKey !== HEALTH_CHECK_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.json({
    status: "Bot is running!",
    uptime: Math.floor(process.uptime() / 60), // Only show minutes
    lastCheck: new Date().toISOString(),
    stockStatus: lastStockStatus === 'unknown' ? 'monitoring' : lastStockStatus
  });
});

// Function to scrape stock page with improved security
async function checkStock() {
  const timestamp = new Date().toISOString();
  try {
    console.log(`[${timestamp}] 🔍 Checking stock...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    const response = await fetch("https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383", {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    }

    const html = await response.text();

    // Limit HTML size to prevent memory issues
    if (html.length > 5 * 1024 * 1024) { // 5MB limit
      throw new Error('Response too large');
    }

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
    if (error.name === 'AbortError') {
      console.error(`[${timestamp}] ❌ Request timeout`);
    } else {
      console.error(`[${timestamp}] ❌ Error checking stock:`, error.message);
    }
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
    const message = `🎉 **STOCK ALERT!**\n\n✅ Casio AE-1200WHL-5AVDF is back in stock!\n\n🛒 **Buy now:** [View Product](https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383)\n\n💰 **Price:** Check website for current price\n⏰ **Checked at:** ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n⚡ **Hurry! Limited stock available**`;

    await bot.telegram.sendMessage(CHAT_ID, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    });
    console.log('✅ Stock notification sent successfully!');
  } catch (err) {
    console.error('❌ Failed to send stock notification:', err.message);
  }
}

// Keep the app alive using Render's environment variable
function keepAlive() {
  // Use Render's automatic environment variable or skip if running locally
  const pingUrl = process.env.RENDER_EXTERNAL_URL;

  if (!pingUrl) {
    console.log('🏓 Self-ping skipped: Running locally');
    return;
  }

  const healthUrl = `${pingUrl}?key=${HEALTH_CHECK_KEY}`;

  fetch(healthUrl)
    .then(res => console.log(`🏓 Self-ping successful: ${res.status}`))
    .catch(err => console.log(`🏓 Self-ping failed: ${err.message}`));
}

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

// Start Express server and bot
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔄 Starting bot with polling...`);

  try {
    await bot.launch();
    console.log('✅ Bot started successfully with polling');

    // Send startup notification
    await bot.telegram.sendMessage(CHAT_ID, `🤖 Casio Stock Bot Started!\n\n✅ Now monitoring: AE-1200WHL-5AVDF\n🌐 Store: casiostore.bhawar.com\n⏰ Started at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n🔄 Check interval: Every 2.5 minutes\n🏓 Self-ping: Every 10 minutes`);
  } catch (error) {
    console.error('❌ Failed to start bot:', error.message);
  }

  console.log('🔍 Starting stock monitoring for Casio AE-1200WHL-5AVDF...');
  console.log('⚡ Checking every 2.5 minutes');

  // Initial stock check and self-ping
  setTimeout(checkStock, 5000);
  setTimeout(() => {
    console.log('🏓 Starting self-ping to prevent sleep...');
    keepAlive();
  }, 10000);
});

// Graceful shutdown to prevent redeploy issues
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
