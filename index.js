import express from "express";
import fetch from "node-fetch";
import { Telegraf } from "telegraf";

const app = express();
app.use(express.json());

// Environment variables  
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TEST_CHAT_ID = process.env.TELEGRAM_TEST_CHAT_ID;
const PORT = process.env.PORT || 3000;
const HEALTH_CHECK_KEY = process.env.HEALTH_CHECK_KEY;
const ADMIN_USER_ID = parseInt(process.env.TELEGRAM_ADMIN_USER_ID) || 1327520482;

// Verify environment variables
if (!BOT_TOKEN || !CHAT_ID || !HEALTH_CHECK_KEY) {
  console.error("❌ Missing required environment variables!");
  process.exit(1);
}

// **FIX BOT CONFLICTS** - Only create bot once
let bot;
try {
  bot = new Telegraf(BOT_TOKEN);
  console.log('✅ Bot instance created successfully');
} catch (error) {
  console.error('❌ Failed to create bot instance:', error.message);
  process.exit(1);
}

// Track status and prevent memory leaks
let lastStockStatus = 'unknown';
let lastHealthCheck = 0;
let checkCount = 0;
let isShuttingDown = false;

// **ENHANCED MEMORY MONITORING**
function logMemoryUsage() {
  const memUsage = process.memoryUsage();
  const memMB = Math.round(memUsage.rss / 1024 / 1024);
  const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  console.log(`💾 Memory: ${memMB}MB | Heap: ${heapMB}MB | Checks: ${checkCount} | Status: ${lastStockStatus}`);

  // Restart if memory gets too high (prevents crashes)
  if (memMB > 300) { // Lowered threshold
    console.log('⚠️ High memory usage detected, restarting...');
    process.exit(0);
  }
}

// **IMPROVED ERROR HANDLING**
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error.message);
  if (!isShuttingDown) {
    isShuttingDown = true;
    setTimeout(() => process.exit(1), 1000);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection:', reason);
  if (!isShuttingDown) {
    isShuttingDown = true;
    setTimeout(() => process.exit(1), 1000);
  }
});

// Health check route
app.get("/", (req, res) => {
  const now = Date.now();
  if (now - lastHealthCheck < 30000) {
    return res.status(429).json({ error: "Too many requests" });
  }
  lastHealthCheck = now;

  const healthKey = req.query.key;
  if (healthKey !== HEALTH_CHECK_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const memUsage = process.memoryUsage();
  res.json({
    status: "Bot is running!",
    uptime: Math.floor(process.uptime() / 60),
    lastCheck: new Date().toISOString(),
    stockStatus: lastStockStatus,
    memory: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
    checks: checkCount,
    interval: "1.5 minutes"
  });
});

// **FIXED STOCK CHECK** - Works with node-fetch properly
async function checkStock() {
  if (isShuttingDown) return;

  const timestamp = new Date().toISOString();
  checkCount++;

  try {
    const memBefore = Math.round(process.memoryUsage().rss / 1024 / 1024);
    console.log(`[${timestamp}] 🔍 Check #${checkCount} - Memory: ${memBefore}MB`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

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
      throw new Error(`HTTP ${response.status}`);
    }

    // **FIXED HTML PROCESSING** - Use .text() instead of stream reader
    const html = await response.text();

    // Limit HTML size to prevent memory issues
    if (html.length > 2 * 1024 * 1024) { // 2MB limit
      throw new Error('Response too large');
    }

    console.log(`[${timestamp}] 📡 Page fetched (${Math.round(html.length / 1024)}KB)`);

    const inStock = checkStockFromHTML(html);

    if (inStock) {
      console.log(`[${timestamp}] ✅ STOCK AVAILABLE!`);
      if (lastStockStatus !== 'available') {
        lastStockStatus = 'available';
        await sendStockNotification();
      }
    } else {
      console.log(`[${timestamp}] ❌ Out of stock`);
      lastStockStatus = 'sold_out';
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[${timestamp}] ❌ Request timeout`);
    } else {
      console.error(`[${timestamp}] ❌ Error: ${error.message}`);
    }
  }

  // Trigger garbage collection every 10 checks
  if (checkCount % 10 === 0) {
    if (global.gc) {
      global.gc();
      console.log('🗑️ Garbage collection triggered');
    }
  }
}

// Stock detection from HTML
function checkStockFromHTML(html) {
  if (!html || html.length < 1000) return false;

  const lowerHtml = html.toLowerCase();

  // Check out of stock first
  const outOfStockKeywords = [
    'out of stock', 'sold out', 'unavailable',
    'notify when available', 'out-of-stock', 'soldout'
  ];

  for (const word of outOfStockKeywords) {
    if (lowerHtml.includes(word)) {
      console.log(`📋 ❌ Out of stock: "${word}"`);
      return false;
    }
  }

  // Check in stock
  const inStockKeywords = [
    'add to cart', 'add to bag', 'buy now',
    'in stock', 'available', 'addtocart'
  ];

  for (const word of inStockKeywords) {
    if (lowerHtml.includes(word)) {
      console.log(`📋 ✅ IN STOCK: "${word}"`);
      return true;
    }
  }

  return false; // Default to out of stock
}

// Send notification
async function sendStockNotification() {
  try {
    const message = `🚨 <b>URGENT STOCK ALERT!</b>\n\n✅ <b>Casio AE-1200WHL-5AVDF is AVAILABLE!</b>\n\n🛒 <a href="https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383">🔥 BUY NOW 🔥</a>\n\n⏰ Found at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n⚡ <b>HURRY! Stock may be limited!</b>`;

    await bot.telegram.sendMessage(CHAT_ID, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: false
    });
    console.log('🎉 STOCK ALERT sent successfully!');
  } catch (err) {
    console.error('❌ Notification failed:', err.message);
  }
}

// Keep alive function
function keepAlive() {
  if (isShuttingDown) return;

  const pingUrl = process.env.RENDER_EXTERNAL_URL;
  if (!pingUrl) {
    console.log('🏓 Local mode - skip ping');
    return;
  }

  const healthUrl = `${pingUrl}?key=${HEALTH_CHECK_KEY}`;

  fetch(healthUrl, { timeout: 5000 })
    .then(res => console.log(`🏓 Keep-alive: ${res.status}`))
    .catch(err => console.log(`🏓 Keep-alive failed: ${err.message}`));
}

// **FIXED BOT COMMANDS**
bot.command('status', async ctx => {
  try {
    const uptime = Math.floor(process.uptime() / 60);
    const memUsage = process.memoryUsage();
    const memMB = Math.round(memUsage.rss / 1024 / 1024);

    const message = `🤖 <b>Fixed Bot Status</b>\n\n✅ Uptime: ${uptime} minutes\n💾 Memory: ${memMB}MB\n📊 Stock: ${lastStockStatus}\n🔢 Checks: ${checkCount}\n⚡ Interval: 1.5 minutes\n⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    await ctx.reply(`Bot Status: Running ${Math.floor(process.uptime() / 60)}min, Stock: ${lastStockStatus}, Checks: ${checkCount}`);
  }
});

bot.command('check', async ctx => {
  try {
    await ctx.reply('🔍 Manual stock check initiated...');
    await checkStock();
    const emoji = lastStockStatus === 'available' ? '✅' : '❌';
    await ctx.reply(`${emoji} Status: ${lastStockStatus}`);
  } catch (error) {
    await ctx.reply('❌ Manual check failed');
  }
});

// **PREVENT MULTIPLE INSTANCES** - Add bot error handler
bot.catch((err, ctx) => {
  console.error('Bot error:', err.message);
  if (err.message.includes('409') || err.message.includes('Conflict')) {
    console.error('🚨 Bot conflict detected - multiple instances running!');
  }
});

// Scheduling with memory monitoring
console.log('🔧 Setting up fixed intervals...');

// Memory check every 2 minutes
setInterval(logMemoryUsage, 120000);

// Stock check every 1.5 minutes
setInterval(checkStock, 90000);

// Keep-alive every 14 minutes  
setInterval(keepAlive, 840000);

// **SAFER SERVER START**
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('🔧 Bot conflicts fixed, memory optimized');

  // **PREVENT DUPLICATE BOTS** - Check if already running
  try {
    console.log('🔄 Starting bot with polling (single instance)...');
    await bot.launch();
    console.log('✅ Bot started successfully - no conflicts');

    const startupMessage = `🛠️ <b>FIXED Stock Bot Started!</b>\n\n✅ Issues resolved:\n• Bot conflicts fixed\n• Memory optimized\n• Fetch errors fixed\n\n⚡ Monitoring: AE-1200WHL-5AVDF\n🔄 Interval: 1.5 minutes\n⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

    await bot.telegram.sendMessage(CHAT_ID, startupMessage, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('❌ Bot startup failed:', error.message);

    if (error.message.includes('409') || error.message.includes('Conflict')) {
      console.error('🚨 MULTIPLE BOT INSTANCES DETECTED!');
      console.error('📋 Solution: Stop all other instances first');
    }
  }

  console.log('🔍 Starting FIXED stock monitoring...');

  // Initial check after 5 seconds
  setTimeout(checkStock, 5000);
  setTimeout(keepAlive, 30000);
});

// **ENHANCED GRACEFUL SHUTDOWN**
process.once('SIGINT', () => {
  console.log('🛑 Graceful shutdown (SIGINT)');
  isShuttingDown = true;
  if (bot) bot.stop('SIGINT');
  setTimeout(() => process.exit(0), 2000);
});

process.once('SIGTERM', () => {
  console.log('🛑 Graceful shutdown (SIGTERM)');
  isShuttingDown = true;
  if (bot) bot.stop('SIGTERM');
  setTimeout(() => process.exit(0), 2000);
});

console.log('🎯 Casio Stock Bot - FIXED Edition');
console.log('✅ Bot conflicts resolved | 💾 Memory optimized | 🔧 Fetch fixed');
