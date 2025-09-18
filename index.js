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

// Initialize the bot
const bot = new Telegraf(BOT_TOKEN);

// Track last stock status and rate limiting
let lastStockStatus = 'unknown';
let lastHealthCheck = 0;
let checkCount = 0;

// **MEMORY MONITORING** - Add this for debugging
function logMemoryUsage() {
  const memUsage = process.memoryUsage();
  const memMB = Math.round(memUsage.rss / 1024 / 1024);
  console.log(`💾 Memory: ${memMB}MB | Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB | Checks: ${checkCount}`);

  // Restart if memory gets too high (prevents crashes)
  if (memMB > 400) {
    console.log('⚠️ High memory usage detected, restarting...');
    process.exit(0); // Render will restart automatically
  }
}

// **ERROR HANDLING** - Add global error handlers
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection:', reason);
  process.exit(1);
});

// Health check route with better rate limiting
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

  // **MEMORY INFO** in health check
  const memUsage = process.memoryUsage();
  res.json({
    status: "Bot is running!",
    uptime: Math.floor(process.uptime() / 60),
    lastCheck: new Date().toISOString(),
    stockStatus: lastStockStatus === 'unknown' ? 'monitoring' : lastStockStatus,
    memory: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
    checks: checkCount
  });
});

// **OPTIMIZED STOCK CHECK** - Fixed memory leaks
async function checkStock() {
  const timestamp = new Date().toISOString();
  checkCount++;

  try {
    console.log(`[${timestamp}] 🔍 Check #${checkCount} - Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // Reduced to 10s

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

    // **MEMORY OPTIMIZATION** - Stream processing instead of storing full HTML
    let html = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let totalSize = 0;
    const maxSize = 2 * 1024 * 1024; // 2MB limit

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > maxSize) {
        reader.releaseLock();
        throw new Error('Response too large');
      }

      html += decoder.decode(value, { stream: true });

      // **EARLY EXIT** - Check for stock indicators as we read
      if (html.length > 50000) { // After 50KB, likely have enough content
        const quickCheck = checkStockFromHTML(html);
        if (quickCheck !== null) break; // Found definitive answer
      }
    }

    console.log(`[${timestamp}] 📡 Page fetched (${Math.round(totalSize / 1024)}KB)`);

    const inStock = checkStockFromHTML(html);

    // **FORCE CLEANUP** - Clear HTML from memory immediately
    html = null;

    if (inStock) {
      console.log(`[${timestamp}] ✅ Stock available!`);
      if (lastStockStatus !== 'available') {
        lastStockStatus = 'available';
        await sendStockNotification();
      }
    } else {
      console.log(`[${timestamp}] ⏳ Out of stock`);
      lastStockStatus = 'sold_out';
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[${timestamp}] ❌ Timeout`);
    } else {
      console.error(`[${timestamp}] ❌ Error: ${error.message}`);
    }
  }

  // **TRIGGER GARBAGE COLLECTION** every 10 checks
  if (checkCount % 10 === 0) {
    if (global.gc) {
      global.gc();
      console.log('🗑️ Garbage collection triggered');
    }
  }
}

// **OPTIMIZED HTML PARSING** - Return early when found
function checkStockFromHTML(html) {
  const lowerHtml = html.toLowerCase();

  // Check out of stock first (more common)
  const outOfStockKeywords = ['out of stock', 'sold out', 'unavailable', 'notify when available'];
  for (const word of outOfStockKeywords) {
    if (lowerHtml.includes(word)) {
      console.log(`📋 Out of stock: "${word}"`);
      return false;
    }
  }

  // Check in stock
  const inStockKeywords = ['add to cart', 'add to bag', 'buy now', 'in stock', 'available'];
  for (const word of inStockKeywords) {
    if (lowerHtml.includes(word)) {
      console.log(`📋 In stock: "${word}"`);
      return true;
    }
  }

  return false; // Default to out of stock
}

// **FIXED NOTIFICATION** - HTML formatting
async function sendStockNotification() {
  try {
    const message = `🎉 <b>STOCK ALERT!</b>\n\n✅ Casio AE-1200WHL-5AVDF is back in stock!\n\n🛒 <a href="https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383">Buy Now</a>\n\n💰 Check website for current price\n⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n⚡ <b>Hurry! Limited stock</b>`;

    await bot.telegram.sendMessage(CHAT_ID, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: false
    });
    console.log('✅ Stock notification sent!');
  } catch (err) {
    console.error('❌ Notification failed:', err.message);
  }
}

// **SAFER KEEP ALIVE** - Less frequent, with error handling
function keepAlive() {
  const pingUrl = process.env.RENDER_EXTERNAL_URL;
  if (!pingUrl) {
    console.log('🏓 Local mode - skip ping');
    return;
  }

  const healthUrl = `${pingUrl}?key=${HEALTH_CHECK_KEY}`;

  fetch(healthUrl, { timeout: 5000 })
    .then(res => console.log(`🏓 Ping: ${res.status}`))
    .catch(err => console.log(`🏓 Ping failed: ${err.message}`));
}

// Your existing bot commands here... (keeping them as is)
bot.command('status', async ctx => {
  try {
    const uptime = Math.floor(process.uptime() / 60);
    const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const message = `🤖 <b>Bot Status</b>\n\n✅ Running: ${uptime}min\n💾 Memory: ${memMB}MB\n📊 Status: ${lastStockStatus}\n🔢 Checks: ${checkCount}\n⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n⚡ Interval: 2.5min`;
    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    await ctx.reply(`Bot Status: Running ${Math.floor(process.uptime() / 60)}min, Status: ${lastStockStatus}`);
  }
});

// **MEMORY MONITORING** - Log every 5 minutes
setInterval(logMemoryUsage, 300000);

// **REDUCED FREQUENCY** - Check every 2.5 minutes instead of 1 minute
setInterval(checkStock, 150000); // 150 seconds = 2.5 minutes

// **LESS FREQUENT PING** - Every 12 minutes instead of 10
setInterval(keepAlive, 720000);

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);

  try {
    await bot.launch();
    console.log('✅ Bot started successfully');

    const startupMessage = `🤖 <b>Optimized Stock Bot Started!</b>\n\n✅ Monitoring: AE-1200WHL-5AVDF\n⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n🔄 Check interval: 2.5 minutes\n💾 Memory monitoring: Enabled`;

    await bot.telegram.sendMessage(CHAT_ID, startupMessage, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('❌ Startup failed:', error.message);
  }

  console.log('🔍 Starting optimized stock monitoring...');

  // Initial check after 10 seconds
  setTimeout(checkStock, 10000);
  setTimeout(keepAlive, 60000);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
