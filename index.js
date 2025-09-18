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

// **ENHANCED MEMORY MONITORING** - Add this for debugging
function logMemoryUsage() {
  const memUsage = process.memoryUsage();
  const memMB = Math.round(memUsage.rss / 1024 / 1024);
  const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  console.log(`💾 Memory: ${memMB}MB | Heap: ${heapMB}MB | Checks: ${checkCount} | Uptime: ${Math.floor(process.uptime() / 60)}min`);

  // Restart if memory gets too high (prevents crashes)
  if (memMB > 400) {
    console.log('⚠️ High memory usage detected, restarting...');
    process.exit(0); // Render will restart automatically
  }
}

// **ENHANCED ERROR HANDLING** - Add global error handlers
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection:', reason);
  process.exit(1);
});

// **ENHANCED HEALTH CHECK** - Better monitoring
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

  // **DETAILED MEMORY INFO** in health check
  const memUsage = process.memoryUsage();
  res.json({
    status: "Bot is running!",
    uptime: Math.floor(process.uptime() / 60),
    lastCheck: new Date().toISOString(),
    stockStatus: lastStockStatus === 'unknown' ? 'monitoring' : lastStockStatus,
    memory: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
    heap: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    checks: checkCount,
    interval: "1.5 minutes"
  });
});

// **SUPER OPTIMIZED STOCK CHECK** - Fixed all memory leaks
async function checkStock() {
  const timestamp = new Date().toISOString();
  checkCount++;

  try {
    const memBefore = Math.round(process.memoryUsage().rss / 1024 / 1024);
    console.log(`[${timestamp}] 🔍 Check #${checkCount} - Memory: ${memBefore}MB`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // Reduced to 8s for faster detection

    const response = await fetch("https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383", {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate" // Enable compression
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // **ADVANCED STREAM PROCESSING** - Memory efficient with early detection
    let html = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let totalSize = 0;
    const maxSize = 1.5 * 1024 * 1024; // Reduced to 1.5MB limit
    let foundResult = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > maxSize) {
        reader.releaseLock();
        throw new Error('Response too large');
      }

      const chunk = decoder.decode(value, { stream: true });
      html += chunk;

      // **SUPER EARLY DETECTION** - Check every 10KB for faster response
      if (html.length > 10000 && html.length % 10000 < chunk.length) {
        const quickCheck = checkStockFromHTML(html);
        if (quickCheck !== null) {
          foundResult = true;
          reader.releaseLock();
          break; // Found definitive answer early!
        }
      }
    }

    const sizeKB = Math.round(totalSize / 1024);
    console.log(`[${timestamp}] 📡 Page fetched (${sizeKB}KB)${foundResult ? ' - Early detection!' : ''}`);

    const inStock = checkStockFromHTML(html);

    // **IMMEDIATE CLEANUP** - Clear HTML from memory instantly
    html = null;

    if (inStock) {
      console.log(`[${timestamp}] ✅ STOCK AVAILABLE!`);
      if (lastStockStatus !== 'available') {
        lastStockStatus = 'available';
        await sendStockNotification();
      }
    } else {
      console.log(`[${timestamp}] ⏳ Out of stock`);
      lastStockStatus = 'sold_out';
    }

    // Log memory after cleanup
    const memAfter = Math.round(process.memoryUsage().rss / 1024 / 1024);
    if (memAfter > memBefore + 5) { // If memory increased by 5MB+
      console.log(`⚠️ Memory leak detected: ${memBefore}MB → ${memAfter}MB`);
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[${timestamp}] ❌ Request timeout (8s)`);
    } else {
      console.error(`[${timestamp}] ❌ Error: ${error.message}`);
    }
  }

  // **AGGRESSIVE GARBAGE COLLECTION** - Every 5 checks for stability
  if (checkCount % 5 === 0) {
    if (global.gc) {
      global.gc();
      console.log('🗑️ Garbage collection triggered (every 5 checks)');
    }
  }
}

// **FASTER HTML PARSING** - Optimized for speed
function checkStockFromHTML(html) {
  if (!html || html.length < 1000) return null; // Need minimum content

  const lowerHtml = html.toLowerCase();

  // **PRIORITY ORDER** - Check most common patterns first
  const outOfStockKeywords = [
    'out of stock',      // Most common
    'sold out',
    'unavailable',
    'notify when available',
    'out-of-stock',
    'soldout'
  ];

  for (const word of outOfStockKeywords) {
    if (lowerHtml.includes(word)) {
      console.log(`📋 ❌ Out of stock: "${word}"`);
      return false;
    }
  }

  // Check in stock indicators
  const inStockKeywords = [
    'add to cart',       // Most reliable
    'add to bag',
    'buy now',
    'in stock',
    'available',
    'addtocart'
  ];

  for (const word of inStockKeywords) {
    if (lowerHtml.includes(word)) {
      console.log(`📋 ✅ IN STOCK: "${word}"`);
      return true;
    }
  }

  return null; // Need more content to decide
}

// **INSTANT NOTIFICATION** - Optimized HTML formatting
async function sendStockNotification() {
  try {
    const message = `🚨 <b>URGENT STOCK ALERT!</b>\n\n✅ <b>Casio AE-1200WHL-5AVDF is AVAILABLE!</b>\n\n🛒 <a href="https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383">🔥 BUY NOW - CLICK HERE 🔥</a>\n\n💰 Check website for current price\n⏰ Detected at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n⚡ <b>HURRY! Stock may be limited!</b>\n🏃‍♂️ <b>Don't wait - order immediately!</b>`;

    await bot.telegram.sendMessage(CHAT_ID, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: false
    });
    console.log('🎉 URGENT stock notification sent successfully!');
  } catch (err) {
    console.error('❌ Critical notification failure:', err.message);

    // Fallback plain text if HTML fails
    try {
      const fallbackMessage = `🚨 STOCK ALERT!\n\nCasio AE-1200WHL-5AVDF is AVAILABLE!\n\nBuy now: https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383\n\nTime: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\nHURRY!`;
      await bot.telegram.sendMessage(CHAT_ID, fallbackMessage);
      console.log('✅ Fallback notification sent');
    } catch (fallbackErr) {
      console.error('❌ Even fallback failed:', fallbackErr.message);
    }
  }
}

// **OPTIMIZED KEEP ALIVE** - Smart pinging
function keepAlive() {
  const pingUrl = process.env.RENDER_EXTERNAL_URL;
  if (!pingUrl) {
    console.log('🏓 Local development - skip ping');
    return;
  }

  const healthUrl = `${pingUrl}?key=${HEALTH_CHECK_KEY}`;

  fetch(healthUrl, {
    timeout: 3000,
    headers: { 'User-Agent': 'KeepAlive/1.0' }
  })
    .then(res => {
      if (res.ok) {
        console.log(`🏓 Keep-alive successful: ${res.status}`);
      } else {
        console.log(`🏓 Keep-alive warning: ${res.status}`);
      }
    })
    .catch(err => console.log(`🏓 Keep-alive failed: ${err.message}`));
}

// **ENHANCED BOT COMMANDS**
bot.command('status', async ctx => {
  try {
    const uptime = Math.floor(process.uptime() / 60);
    const memUsage = process.memoryUsage();
    const memMB = Math.round(memUsage.rss / 1024 / 1024);
    const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);

    const message = `🤖 <b>Optimized Bot Status</b>\n\n✅ Uptime: ${uptime} minutes\n💾 Memory: ${memMB}MB (Heap: ${heapMB}MB)\n📊 Stock: ${lastStockStatus}\n🔢 Total checks: ${checkCount}\n⚡ Interval: <b>1.5 minutes</b> ⚡\n⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n🚀 <b>Fast & Stable Monitoring!</b>`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    // Fallback to simple text
    const uptime = Math.floor(process.uptime() / 60);
    await ctx.reply(`🤖 Bot Status: Running ${uptime}min | Stock: ${lastStockStatus} | Checks: ${checkCount} | Interval: 1.5min`);
  }
});

bot.command('check', async ctx => {
  try {
    await ctx.reply('🔍 Checking stock now...');
    await checkStock();
    const statusEmoji = lastStockStatus === 'available' ? '✅' : '❌';
    await ctx.reply(`${statusEmoji} Current status: ${lastStockStatus}`);
  } catch (error) {
    console.error('Manual check error:', error);
    await ctx.reply('❌ Error during manual stock check');
  }
});

// **OPTIMAL SCHEDULING** - Perfect balance of speed vs stability
console.log('🔧 Setting up optimized intervals...');

// Memory monitoring every 3 minutes (more frequent for stability)
setInterval(logMemoryUsage, 180000);

// **SWEET SPOT: 1.5 minute stock checks** - Fast but stable!
setInterval(checkStock, 90000); // 90 seconds = 1.5 minutes

// Keep-alive every 14 minutes (just under 15min sleep threshold)
setInterval(keepAlive, 840000);

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('⚡ Optimization Level: MAXIMUM');
  console.log('🎯 Check Interval: 1.5 minutes (FAST + STABLE)');

  try {
    await bot.launch();
    console.log('✅ Bot started successfully with optimizations');

    const startupMessage = `🚀 <b>SUPER OPTIMIZED Stock Bot Started!</b>\n\n✅ Product: AE-1200WHL-5AVDF\n⚡ Check interval: <b>1.5 minutes</b>\n💾 Memory monitoring: Advanced\n🛡️ Crash protection: Enabled\n⏰ Started: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n🎯 <b>Fast notifications, maximum stability!</b>`;

    await bot.telegram.sendMessage(CHAT_ID, startupMessage, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('❌ Startup failed:', error.message);
  }

  console.log('🔍 Starting SUPER OPTIMIZED stock monitoring...');
  console.log('💡 Features: Early detection, memory optimization, crash prevention');

  // Quick initial check after 5 seconds
  setTimeout(checkStock, 5000);
  setTimeout(keepAlive, 30000);
});

// Enhanced graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 Graceful shutdown initiated (SIGINT)');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('🛑 Graceful shutdown initiated (SIGTERM)');
  bot.stop('SIGTERM');
});

console.log('🎯 Casio Stock Bot - Super Optimized Edition');
console.log('⚡ 1.5min intervals | 🛡️ Crash protection | 💾 Memory optimization');
