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

// Check for required environment variables
if (!BOT_TOKEN || !CHAT_ID || !WEBHOOK_URL) {
  console.error("❌ Missing required environment variables!");
  console.error("Please set: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, WEBHOOK_URL");
  process.exit(1);
}

// Initialize bot
const bot = new Telegraf(BOT_TOKEN);

// Stock status tracking
let lastStockStatus = 'unknown';

// Health check route
app.get("/", (req, res) => {
  res.json({
    status: "Bot is running!",
    uptime: process.uptime(),
    lastCheck: new Date().toISOString(),
    stockStatus: lastStockStatus
  });
});

// Stock check function for Bhawar Casio Store
async function checkStock() {
  const timestamp = new Date().toISOString();
  
  try {
    console.log(`[${timestamp}] 🔍 Checking Casio AE-1200WHL-5AVDF stock...`);
    
    // Check if the product page is accessible and contains "Add to Cart" button
    const res = await fetch("https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383", {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive"
      }
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const html = await res.text();
    console.log(`[${timestamp}] 📡 Page fetched successfully`);
    
    // Check for stock indicators
    const isInStock = checkStockFromHTML(html);
    
    if (isInStock) {
      console.log(`[${timestamp}] ✅ Stock is available!`);
      
      // Only send notification if status changed
      if (lastStockStatus !== 'available') {
        lastStockStatus = 'available';
        await sendStockNotification();
      }
    } else {
      console.log(`[${timestamp}] ⏳ Still sold out or unavailable`);
      lastStockStatus = 'sold_out';
    }
    
  } catch (err) {
    console.error(`[${timestamp}] ❌ Error checking stock:`, err.message);
  }
}

// Function to parse HTML and determine stock status
function checkStockFromHTML(html) {
  // Convert to lowercase for easier matching
  const htmlLower = html.toLowerCase();
  
  // Positive indicators (in stock)
  const inStockIndicators = [
    'add to cart',
    'add to bag',
    'buy now',
    'in stock',
    'available',
    'addtocart'
  ];
  
  // Negative indicators (out of stock)
  const outOfStockIndicators = [
    'out of stock',
    'sold out',
    'unavailable',
    'notify when available',
    'out-of-stock',
    'soldout',
    'preorder',
    'pre-order'
  ];
  
  // Check for out of stock indicators first
  for (const indicator of outOfStockIndicators) {
    if (htmlLower.includes(indicator)) {
      console.log(`📋 Found out-of-stock indicator: "${indicator}"`);
      return false;
    }
  }
  
  // Check for in stock indicators
  for (const indicator of inStockIndicators) {
    if (htmlLower.includes(indicator)) {
      console.log(`📋 Found in-stock indicator: "${indicator}"`);
      return true;
    }
  }
  
  // If no clear indicators found, assume out of stock
  console.log(`📋 No clear stock indicators found, assuming out of stock`);
  return false;
}

// Send stock notification
async function sendStockNotification() {
  try {
    const message = `🎉 **STOCK ALERT!**

✅ Casio AE-1200WHL-5AVDF is back in stock!

🛒 **Buy now:** https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383

💰 **Price:** Check website for current price
⏰ **Checked at:** ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

⚡ **Hurry! Limited stock available**`;
    
    await bot.telegram.sendMessage(CHAT_ID, message, { 
      parse_mode: 'Markdown',
      disable_web_page_preview: false 
    });
    
    console.log(`✅ Stock notification sent successfully!`);
  } catch (err) {
    console.error("❌ Failed to send stock notification:", err.message);
  }
}

// Set up webhook
const webhookPath = "/bot";

// Setup webhook with error handling
async function setupWebhook() {
  try {
    await bot.telegram.setWebhook(`${WEBHOOK_URL}${webhookPath}`);
    console.log(`✅ Webhook set up: ${WEBHOOK_URL}${webhookPath}`);
  } catch (err) {
    console.error("❌ Webhook setup failed:", err.message);
  }
}

app.use(webhookPath, bot.webhookCallback(webhookPath));

// Bot commands
bot.command('status', async (ctx) => {
  const uptime = Math.floor(process.uptime() / 60);
  const message = `🤖 **Bot Status**

✅ Running for ${uptime} minutes
📊 Stock Status: ${lastStockStatus}
⏰ Last Check: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
🎯 Monitoring: Casio AE-1200WHL-5AVDF
⚡ Check Interval: Every 2.5 minute`;
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('check', async (ctx) => {
  await ctx.reply('🔍 Checking stock now...');
  await checkStock();
  await ctx.reply(`Stock status: ${lastStockStatus}`);
});

// Check stock every 1 minute (60 seconds) - UPDATED
setInterval(checkStock, 150_000);
// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Webhook URL: ${WEBHOOK_URL}${webhookPath}`);
  
  await setupWebhook();
  
  // Send startup notification
  try {
    await bot.telegram.sendMessage(CHAT_ID, `🤖 **Casio Stock Bot Started!**

✅ Now monitoring: AE-1200WHL-5AVDF
🌐 Store: casiostore.bhawar.com
⏰ Started at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
🔄 Check interval: **Every 1 minute**`, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error("❌ Startup notification failed:", err.message);
  }
  
  // Start stock checking
  console.log('🔍 Starting stock monitoring for Casio AE-1200WHL-5AVDF...');
  console.log('⚡ Checking every 1 minute');
  
  // Initial stock check
  setTimeout(checkStock, 5000); // Check after 5 seconds
});
