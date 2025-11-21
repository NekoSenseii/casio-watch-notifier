// Top of file: imports (modern Node supports global fetch)
import express from "express";
import { Telegraf } from "telegraf";
import * as cheerio from "cheerio";

// --- Fetch fallback: SAFE for Render (no top-level await) ---
let fetchFn;

if (typeof fetch !== "undefined") {
  // Node 18+ (Render default is Node 16 unless changed)
  fetchFn = fetch;
} else {
  // Older Node version → require node-fetch
  const nodeFetch = await Promise.resolve().then(() => import("node-fetch"));
  fetchFn = nodeFetch.default;
}


// --- CONFIGURATION & ENVIRONMENT VARIABLES ---
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RAW_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const CHAT_ID = RAW_CHAT_ID ? (isNaN(Number(RAW_CHAT_ID)) ? RAW_CHAT_ID : Number(RAW_CHAT_ID)) : undefined;
const TEST_CHAT_ID = process.env.TELEGRAM_TEST_CHAT_ID;
const PORT = process.env.PORT || 3000;
const HEALTH_CHECK_KEY = process.env.HEALTH_CHECK_KEY;
const ADMIN_USER_ID = process.env.TELEGRAM_ADMIN_USER_ID
  ? Number(process.env.TELEGRAM_ADMIN_USER_ID)
  : 1327520482;
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

const app = express();
app.use(express.json());
const bot = new Telegraf(BOT_TOKEN);

// --- STATE ---
let lastStockStatus = "unknown";
let lastHealthCheck = 0;
let isChecking = false;

// --- Robust stock parsing ---
function checkStockFromHTML(html) {
  try {
    const $ = cheerio.load(html);

    // Try multiple heuristics to find an actionable "buy" control
    const selectors = [
      ".product-form__submit",
      'button[name="add"]',
      'button[id*="add"]',
      'button[class*="add"]',
      'button:contains("Add to cart")',
      'button:contains("Add to bag")',
      'button:contains("Buy now")',
      'a[href*="/cart"]',
      'form[action*="/cart"] input[type="submit"]',
      'input[type="submit"][value*="Add"]',
    ];

    let found = null;
    for (const sel of selectors) {
      const el = $(sel);
      if (el && el.length > 0) {
        found = el.first();
        break;
      }
    }

    if (!found) {
      console.log('📋 No "add/buy" element detected; assume out of stock.');
      return false;
    }

    const buttonText = (found.text() || found.attr("value") || "").toLowerCase().trim();
    const isDisabled =
      found.is(":disabled") ||
      found.attr("disabled") !== undefined ||
      found.attr("aria-disabled") === "true";

    // Additional heuristics: presence of 'sold out', 'out of stock', 'unavailable'
    if (
      isDisabled ||
      /sold out|out of stock|unavailable|notify me|backorder/i.test(buttonText)
    ) {
      console.log(`📋 Out-of-stock detected: text="${buttonText}" disabled=${isDisabled}`);
      return false;
    }

    console.log(`📋 In-stock heuristics matched: text="${buttonText}" disabled=${isDisabled}`);
    return true;
  } catch (error) {
    console.error("❌ Error parsing HTML with cheerio:", error);
    return false;
  }
}

// --- checkStock using fetchFn ---
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
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetchFn(PRODUCT_URL, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} - ${res.statusText}`);
    }

    const html = await res.text();
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
    if (error.name === "AbortError" || error.type === "aborted") {
      console.error(`[${timestamp}] ❌ Request timed out.`);
    } else {
      console.error(`[${timestamp}] ❌ Stock check error:`, error);
    }
  } finally {
    isChecking = false;
  }
}

// --- keepAlive unchanged but using fetchFn ---
function keepAlive() {
  const pingUrl = process.env.RENDER_EXTERNAL_URL;
  if (!pingUrl) {
    console.log("🏓 Self-ping skipped: RENDER_EXTERNAL_URL not set (running locally).");
    return;
  }

  const healthUrl = `${pingUrl}/healthz?key=${HEALTH_CHECK_KEY}`;
  fetchFn(healthUrl)
    .then((res) => {
      console.log(`🏓 Self-ping status: ${res.status}`);
    })
    .catch((err) => console.error(`🏓 Self-ping error: ${err?.message || err}`));
}

// --- HEALTHZ: validate key BEFORE updating lastHealthCheck ---
app.get("/healthz", (req, res) => {
  const now = Date.now();

  if (req.query.key !== HEALTH_CHECK_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (now - lastHealthCheck < 30000) {
    return res.status(429).json({ error: "Too many requests" });
  }

  lastHealthCheck = now;

  res.json({
    status: "Bot is running",
    uptimeMinutes: Math.floor(process.uptime() / 60),
    stockStatus: lastStockStatus,
  });
});

// --- adminOnly middleware: defensive & friendly ---
const adminOnly = (ctx, next) => {
  try {
    const fromId = ctx?.from?.id;
    if (!fromId) {
      // can't verify the sender
      return ctx.reply("🚫 Unable to verify user. This command requires admin privileges.");
    }
    if (fromId === ADMIN_USER_ID) return next();
    // give a helpful reply regardless of chat type
    return ctx.reply("🚫 This command is for the bot administrator only.");
  } catch (err) {
    console.error("adminOnly middleware error:", err);
    return; // swallow to avoid crashing middleware
  }
};

// --- sendStockNotification: ensure CHAT_ID is passed correctly ---
async function sendStockNotification() {
  const message = `🎉 <b>STOCK ALERT!</b>\n\n✅ Casio AE-1200WHL-5AVDF is back in stock!\n\n🛒 <b>Buy now:</b> <a href="${PRODUCT_URL}">View Product</a>\n\n💰 <b>Price:</b> Check website for latest price\n⏰ <b>Checked at:</b> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n\n⚡ <b>Hurry! Limited stock available</b>`;

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

// --- process-level error logging ---
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
