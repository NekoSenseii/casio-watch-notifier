import express from "express";
import fetch from "node-fetch";
import { Telegraf } from "telegraf";
import * as cheerio from 'cheerio'; // <-- Import cheerio for robust parsing

const app = express();
app.use(express.json());

// --- CONFIGURATION & ENVIRONMENT VARIABLES ---
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TEST_CHAT_ID = process.env.TELEGRAM_TEST_CHAT_ID;
const PORT = process.env.PORT || 3000;
const HEALTH_CHECK_KEY = process.env.HEALTH_CHECK_KEY;
const ADMIN_USER_ID = parseInt(process.env.TELEGRAM_ADMIN_USER_ID) || 1327520482;

// --- STARTUP VALIDATION ---
if (!BOT_TOKEN || !CHAT_ID) {
  console.error("❌ Missing required environment variables: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID!");
  process.exit(1);
}
if (!HEALTH_CHECK_KEY) {
  console.error("❌ HEALTH_CHECK_KEY environment variable is required!");
  process.exit(1);
}

// --- BOT INITIALIZATION ---
const bot = new Telegraf(BOT_TOKEN);

// --- STATE MANAGEMENT ---
let lastStockStatus = 'unknown';
let lastHealthCheck = 0;

// --- CORE FUNCTIONS ---

/**
 * Parses HTML using cheerio to determine stock status.
 * @param {string} html - The HTML content of the product page.
 * @returns {boolean} - True if the item is in stock, false otherwise.
 */
function checkStockFromHTML(html) {
  try {
    const $ = cheerio.load(html);
    const addToCartButton = $('.product-form__submit, form[action*="/cart/add"] button[type="submit"], button[name="add"]');

    if (addToCartButton.length === 0) {
      console.log('📋 "Add to cart" button not found, assuming out of stock.');
      return false;
    }

    // Checks the button is disabled or contains "Sold Out" text.
    const buttonText = addToCartButton.text().toLowerCase();
    const isDisabled = addToCartButton.is(':disabled');

    if (isDisabled || buttonText.includes('sold out')) {
      console.log(`📋 Found out-of-stock indicator: Button text is "${buttonText}" and disabled state is ${isDisabled}.`);
      return false;
    }

    console.log(`📋 Found in-stock indicator: "Add to cart" button is active.`);
    return true;

  } catch (error) {
    console.error("❌ Error parsing HTML with cheerio:", error);
    return false; // Fail safely
  }
}

/**
 * Scrapes the product page to check for stock availability.
 */
async function checkStock() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🔍 Checking stock...`);
  try {
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

    if (html.length > 5 * 1024 * 1024) { // 5MB limit
      throw new Error('Response too large');
    }

    console.log(`[${timestamp}] 📡 Page fetched successfully. Parsing content...`);
    const inStock = checkStockFromHTML(html); // Use the new cheerio function

    if (inStock) {
      console.log(`[${timestamp}] ✅ Stock is available!`);
      if (lastStockStatus !== 'available') {
        lastStockStatus = 'available';
        await sendStockNotification();
      }
    } else {
      console.log(`[${timestamp}] ⏳ Still sold out or unavailable.`);
      lastStockStatus = 'sold_out';
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[${timestamp}] ❌ Request timed out.`);
    } else {
      console.error(`[${timestamp}] ❌ Error during stock check:`, error);
    }
  }
}

/**
 * Pings the app's health check URL to keep it alive on hosting services like Render.
 */
function keepAlive() {
  const pingUrl = process.env.RENDER_EXTERNAL_URL;
  if (!pingUrl) {
    console.log('🏓 Self-ping skipped: RENDER_EXTERNAL_URL not set (likely running locally).');
    return;
  }

  const healthUrl = `${pingUrl}?key=${HEALTH_CHECK_KEY}`;
  fetch(healthUrl)
    .then(res => {
      if (res.ok) {
        console.log(`🏓 Self-ping successful: Status ${res.status}`);
      } else {
        console.error(`🏓 Self-ping failed: Status ${res.status}`);
      }
    })
    .catch(err => console.error(`🏓 Self-ping error: ${err.message}`));
}

// --- TELEGRAM NOTIFICATION FUNCTIONS ---

async function sendStockNotification() {
  const message = `🎉 <b>STOCK ALERT!</b>\n\n✅ Casio AE-1200WHL-5AVDF is back in stock!\n\n🛒 <b>Buy now:</b> <a href="https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383">View Product</a>\n\n💰 <b>Price:</b> Check website for current price\n⏰ <b>Checked at:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n⚡ <b>Hurry! Limited stock available</b>`;
  try {
    await bot.telegram.sendMessage(CHAT_ID, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: false
    });
    console.log('✅ Stock notification sent successfully!');
  } catch (err) {
    console.error('❌ Failed to send stock notification:', err);
  }
}

async function sendTestNotification(chatId) {
  const message = `🧪 <b>DEV TEST ALERT</b>\n\nThis is a test stock notification for the admin.\n\n🛒 <b>Product:</b> Casio AE-1200WHL-5AVDF\n⏰ <b>Test Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n⚠️ <i>This is not a real stock alert.</i>`;
  try {
    await bot.telegram.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
  } catch (err) {
    console.error('❌ Failed to send test notification:', err);
  }
}

// --- EXPRESS SERVER ROUTES ---

app.get("/ping", (req, res) => {
  res.json({ message: "pong", timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  // Rate limiting (1 request per 5 seconds)
  const now = Date.now();
  if (now - lastHealthCheck < 5000) {
    return res.status(429).json({ error: "Too many requests" });
  }
  lastHealthCheck = now;

  // Authentication
  if (req.query.key !== HEALTH_CHECK_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.json({
    status: "Bot is running!",
    uptimeMinutes: Math.floor(process.uptime() / 60),
    stockStatus: lastStockStatus
  });
});

// --- TELEGRAM BOT COMMANDS ---

async function setUserCommands() {
  const publicCommands = [
    { command: 'status', description: 'Check bot and stock status' },
    { command: 'check', description: 'Manually trigger a stock check' }
  ];

  const adminCommands = [
    ...publicCommands,
    { command: 'test', description: 'Send a test stock notification to the group' },
    { command: 'devtest', description: 'Send a private test notification (admin only)' },
    { command: 'adminstatus', description: 'Get detailed admin status' },
    { command: 'config', description: 'View current bot configuration' }
  ];

  try {
    // Set default commands for everyone
    await bot.telegram.setMyCommands(publicCommands);
    console.log('✅ Public commands set globally.');

    // Set enhanced commands for the admin in their private chat
    await bot.telegram.setMyCommands(adminCommands, {
      scope: { type: 'chat', chat_id: ADMIN_USER_ID } // Corrected scope
    });
    console.log('✅ Admin commands set for admin user.');

  } catch (error) {
    console.error('❌ Error setting bot commands:', error);
  }
}

// Helper middleware to check for admin user
const adminOnly = (ctx, next) => {
  if (ctx.from.id === ADMIN_USER_ID) {
    return next();
  } else if (ctx.chat.type !== 'private') {
    // Silently ignore non-admin commands in groups
    return;
  }
  return ctx.reply('🚫 This command is for the bot administrator only.');
};

bot.command('status', async (ctx) => {
  const uptime = Math.floor(process.uptime() / 60);
  const message = `🤖 <b>Bot Status</b>\n\n✅ Running for ${uptime} minutes\n📊 Stock Status: <b>${lastStockStatus.replace('_', ' ')}</b>\n⏰ Last Check: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n🎯 Monitoring: Casio AE-1200WHL-5AVDF`;
  await ctx.replyWithHTML(message);
});

bot.command('check', async (ctx) => {
  await ctx.reply('🔍 On-demand check initiated...');
  await checkStock();
  await ctx.reply(`✅ Check complete. Current status: <b>${lastStockStatus.replace('_', ' ')}</b>`, { parse_mode: 'HTML' });
});

bot.command('test', adminOnly, async (ctx) => {
  if (!ctx) return; // Command was ignored in a group by a non-admin
  await ctx.reply('🧪 Simulating an in-stock event to test group notification...');
  const originalStatus = lastStockStatus;
  lastStockStatus = 'sold_out'; // Force state change
  await checkStock(); // This will trigger the notification if scraping finds it in stock
  lastStockStatus = originalStatus; // Restore original status
  await ctx.reply('✅ Test sent. Please check the main channel.');
});

bot.command('devtest', adminOnly, async (ctx) => {
  if (!ctx) return;
  if (ctx.chat.type !== 'private') {
    return ctx.reply('This command only works in a private chat with the bot.');
  }
  await ctx.reply('🧪 Sending a private test notification...');
  await sendTestNotification(ctx.chat.id);
});

bot.command('adminstatus', adminOnly, async (ctx) => {
  if (!ctx) return;
  const message = `🔧 <b>Admin Status</b>\n\n` +
    `📊 <b>Bot Uptime:</b> ${Math.floor(process.uptime() / 60)} minutes\n` +
    `📈 <b>Last Stock Status:</b> ${lastStockStatus}\n` +
    `🏠 <b>Main Group ID:</b> <code>${CHAT_ID}</code>\n` +
    `🧪 <b>Test Group ID:</b> <code>${TEST_CHAT_ID || 'Not set'}</code>\n` +
    `👤 <b>Your User ID:</b> <code>${ctx.from.id}</code>`;
  await ctx.replyWithHTML(message);
});

bot.command('config', adminOnly, async (ctx) => {
  if (!ctx) return;
  const message = `⚙️ <b>Bot Configuration</b>\n\n` +
    `⏱️ <b>Check Interval:</b> 5 seconds\n` + // <-- CHANGED
    `🏓 <b>Self-Ping Interval:</b> 10 minutes\n` +
    `👑 <b>Admin User ID:</b> <code>${ADMIN_USER_ID}</code>`;
  await ctx.replyWithHTML(message);
});

// --- BOT ERROR HANDLING ---
bot.catch((err, ctx) => {
  console.error(`❌ Unhandled error for ${ctx.updateType}`, err);
});

// --- SCHEDULING & SERVER START ---
async function start() {
  // Schedule periodic tasks
  setInterval(checkStock, 5000); // Check stock every 5 second <-- CHANGED
  setInterval(keepAlive, 600000); // Self-ping every 10 minutes

  // Launch Express server
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });

  // Launch the bot
  await bot.launch();
  console.log('✅ Bot started successfully with polling.');

  // Set command menus after launching
  await setUserCommands();

  // Send a startup notification
  const startupMessage = `🤖 <b>Casio Stock Bot Started!</b>\n\n✅ Now monitoring stock.\n⏰ Started at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n⏱️ Check interval: Every 5 second.`; // <-- CHANGED
  await bot.telegram.sendMessage(CHAT_ID, startupMessage, { parse_mode: 'HTML' });

  // Initial checks after a short delay
  console.log('🔍 Performing initial stock check and self-ping...');
  setTimeout(checkStock, 5000);
  setTimeout(keepAlive, 10000);
}

start().catch(error => {
  console.error('❌ Failed to start the application:', error);
  process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));