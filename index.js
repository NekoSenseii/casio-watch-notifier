import express from "express";
import fetch from "node-fetch";
import { Telegraf } from "telegraf";
import * as cheerio from "cheerio";

const app = express();
app.use(express.json());

// --- CONFIGURATION & ENVIRONMENT VARIABLES ---
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TEST_CHAT_ID = process.env.TELEGRAM_TEST_CHAT_ID;
const PORT = process.env.PORT || 3000;
const HEALTH_CHECK_KEY = process.env.HEALTH_CHECK_KEY;
const ADMIN_USER_ID = parseInt(process.env.TELEGRAM_ADMIN_USER_ID) || 1327520482;
const PRODUCT_URL =
  "https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383";

// --- STARTUP VALIDATION ---
if (!BOT_TOKEN || !CHAT_ID) {
  console.error(
    "❌ Missing required environment variables: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID!"
  );
  process.exit(1);
}
if (!HEALTH_CHECK_KEY) {
  console.error("❌ HEALTH_CHECK_KEY environment variable is required!");
  process.exit(1);
}

// --- BOT INITIALIZATION ---
const bot = new Telegraf(BOT_TOKEN);

// --- STATE MANAGEMENT ---
let lastStockStatus = "unknown";
let lastHealthCheck = 0;
let isChecking = false; // prevent overlapping checks

// --- CORE FUNCTIONS ---

/**
 * Parses HTML using cheerio to determine stock status.
 * @param {string} html - The HTML content of the product page.
 * @returns {boolean} - True if the item is in stock, false otherwise.
 */
function checkStockFromHTML(html) {
  try {
    const $ = cheerio.load(html);

    // Broaden selector in case the structure changes
    const addToCartButton = $(
      '.product-form__submit, button[name="add"], button:contains("Add to cart")'
    );

    if (addToCartButton.length === 0) {
      console.log('📋 "Add to cart" button not found, assuming out of stock.');
      return false;
    }

    const buttonText = addToCartButton.text().toLowerCase().trim();
    const isDisabled =
      addToCartButton.is(":disabled") ||
      addToCartButton.attr("disabled") !== undefined;

    if (isDisabled || buttonText.includes("sold out")) {
      console.log(
        `📋 Out-of-stock: text="${buttonText}" | disabled=${isDisabled}`
      );
      return false;
    }

    console.log(`📋 In-stock: active "Add to cart" button detected.`);
    return true;
  } catch (error) {
    console.error("❌ Error parsing HTML with cheerio:", error);
    return false;
  }
}

/**
 * Scrapes the product page to check for stock availability.
 */
async function checkStock() {
  if (isChecking) {
    console.log("⚙️ Previous check still running — skipping this cycle.");
    return;
  }

  isChecking = true;
  const timestamp = new Date().toISOString();

  try {
    console.log(`[${timestamp}] 🔍 Checking stock...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(PRODUCT_URL, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    }

    const html = await response.text();
    if (html.length > 5 * 1024 * 1024) {
      throw new Error("Response too large");
    }

    console.log(`[${timestamp}] 📡 Page fetched. Parsing content...`);
    const inStock = checkStockFromHTML(html);

    if (inStock) {
      console.log(`[${timestamp}] ✅ Stock is available!`);
      if (lastStockStatus !== "available") {
        lastStockStatus = "available";
        await sendStockNotification();
      }
    } else {
      console.log(`[${timestamp}] ⏳ Still sold out.`);
      lastStockStatus = "sold_out";
    }
  } catch (error) {
    if (error.name === "AbortError") {
      console.error(`[${timestamp}] ❌ Request timed out.`);
    } else {
      console.error(`[${timestamp}] ❌ Stock check error:`, error);
    }
  } finally {
    isChecking = false;
  }
}

/**
 * Pings the app's health check URL to keep it alive.
 */
function keepAlive() {
  const pingUrl = process.env.RENDER_EXTERNAL_URL;
  if (!pingUrl) {
    console.log(
      "🏓 Self-ping skipped: RENDER_EXTERNAL_URL not set (running locally)."
    );
    return;
  }

  const healthUrl = `${pingUrl}/healthz?key=${HEALTH_CHECK_KEY}`;
  fetch(healthUrl)
    .then((res) => {
      if (res.ok) console.log(`🏓 Self-ping successful: ${res.status}`);
      else console.error(`🏓 Self-ping failed: ${res.status}`);
    })
    .catch((err) => console.error(`🏓 Self-ping error: ${err.message}`));
}

// --- TELEGRAM NOTIFICATION FUNCTIONS ---

async function sendStockNotification() {
  const message = `🎉 <b>STOCK ALERT!</b>\n\n✅ Casio AE-1200WHL-5AVDF is back in stock!\n\n🛒 <b>Buy now:</b> <a href="${PRODUCT_URL}">View Product</a>\n\n💰 <b>Price:</b> Check website for latest price\n⏰ <b>Checked at:</b> ${new Date().toLocaleString(
    "en-IN",
    { timeZone: "Asia/Kolkata" }
  )}\n\n⚡ <b>Hurry! Limited stock available</b>`;

  try {
    await bot.telegram.sendMessage(CHAT_ID, message, {
      parse_mode: "HTML",
      disable_web_page_preview: false,
    });
    console.log("✅ Stock notification sent successfully!");
  } catch (err) {
    console.error("❌ Failed to send stock notification:", err);
  }
}

async function sendTestNotification(chatId) {
  const message = `🧪 <b>DEV TEST ALERT</b>\n\nThis is a test stock notification for the admin.\n\n🛒 <b>Product:</b> Casio AE-1200WHL-5AVDF\n⏰ <b>Test Time:</b> ${new Date().toLocaleString(
    "en-IN",
    { timeZone: "Asia/Kolkata" }
  )}\n\n⚠️ <i>This is not a real stock alert.</i>`;
  try {
    await bot.telegram.sendMessage(chatId, message, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error("❌ Failed to send test notification:", err);
  }
}

// --- EXPRESS SERVER ROUTES ---

app.get("/ping", (req, res) => {
  res.json({ message: "pong", timestamp: new Date().toISOString() });
});

app.get("/healthz", (req, res) => {
  const now = Date.now();
  if (now - lastHealthCheck < 30000)
    return res.status(429).json({ error: "Too many requests" });

  lastHealthCheck = now;

  if (req.query.key !== HEALTH_CHECK_KEY)
    return res.status(401).json({ error: "Unauthorized" });

  res.json({
    status: "Bot is running",
    uptimeMinutes: Math.floor(process.uptime() / 60),
    stockStatus: lastStockStatus,
  });
});

// --- TELEGRAM BOT COMMANDS ---

const adminOnly = (ctx, next) => {
  if (ctx.from.id === ADMIN_USER_ID) return next();
  if (ctx.chat.type !== "private") return;
  return ctx.reply("🚫 This command is for the bot administrator only.");
};

bot.command("status", async (ctx) => {
  const uptime = Math.floor(process.uptime() / 60);
  const message = `🤖 <b>Bot Status</b>\n\n✅ Running for ${uptime} minutes\n📊 Stock Status: <b>${lastStockStatus.replace(
    "_",
    " "
  )}</b>\n⏰ Last Check: ${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}\n🎯 Monitoring: Casio AE-1200WHL-5AVDF`;
  await ctx.replyWithHTML(message);
});

bot.command("check", async (ctx) => {
  await ctx.reply("🔍 Manual stock check started...");
  await checkStock();
  await ctx.reply(`✅ Current status: <b>${lastStockStatus}</b>`, {
    parse_mode: "HTML",
  });
});

bot.command("test", adminOnly, async (ctx) => {
  await ctx.reply("🧪 Testing group notification...");
  await sendStockNotification();
  await ctx.reply("✅ Test sent!");
});

bot.command("devtest", adminOnly, async (ctx) => {
  if (ctx.chat.type !== "private")
    return ctx.reply("This command only works in private chat.");
  await ctx.reply("🧪 Sending private test notification...");
  await sendTestNotification(ctx.chat.id);
});

bot.command("config", adminOnly, async (ctx) => {
  const message = `⚙️ <b>Bot Configuration</b>\n\n⏱️ <b>Check Interval:</b> 30 seconds\n🏓 <b>Self-Ping Interval:</b> 10 minutes\n👑 <b>Admin ID:</b> <code>${ADMIN_USER_ID}</code>`;
  await ctx.replyWithHTML(message);
});

bot.catch((err, ctx) =>
  console.error(`❌ Unhandled error for ${ctx.updateType}:`, err)
);

// --- SCHEDULING & SERVER START ---
async function start() {
  setInterval(checkStock, 30000); // 30 seconds
  setInterval(keepAlive, 600000); // 10 minutes

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });

  await bot.launch();
  console.log("✅ Bot started successfully with polling.");

  const startupMessage = `🤖 <b>Casio Stock Bot Started!</b>\n\n✅ Monitoring active.\n⏰ Started at: ${new Date().toLocaleString(
    "en-IN",
    { timeZone: "Asia/Kolkata" }
  )}\n⏱️ Check interval: Every 30 seconds.`;
  await bot.telegram.sendMessage(CHAT_ID, startupMessage, {
    parse_mode: "HTML",
  });

  console.log("🔍 Performing initial stock check...");
  setTimeout(checkStock, 5000);
  setTimeout(keepAlive, 10000);
}

start().catch((error) => {
  console.error("❌ Failed to start:", error);
  process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
