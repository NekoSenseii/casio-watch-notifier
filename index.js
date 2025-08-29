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

// ... (your existing checkStock, sendStockNotification, and other functions)

// Self-ping function to prevent Render from sleeping
function keepAlive() {
  const url = `${WEBHOOK_URL}`; // Ping your own health endpoint

  fetch(url)
    .then(response => {
      console.log(`🏓 Self-ping successful: ${response.status}`);
    })
    .catch(err => {
      console.log(`🏓 Self-ping failed: ${err.message}`);
    });
}

// Check stock every 2.5 minutes
setInterval(checkStock, 150_000);

// Ping every 10 minutes to stay awake
setInterval(keepAlive, 600_000);

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);

  await setupWebhook();

  // Send startup notification
  try {
    await bot.telegram.sendMessage(CHAT_ID, `🤖 **Bot Restarted!**

✅ Now monitoring: AE-1200WHL-5AVDF
⏰ Restarted at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
🔄 Check interval: Every 2.5 minutes
🏓 Self-ping: Every 10 minutes`, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error("❌ Startup notification failed:", err.message);
  }

  // Start services
  setTimeout(checkStock, 5000);
  setTimeout(() => {
    console.log('🏓 Starting self-ping to prevent sleep...');
    keepAlive();
  }, 10000);
});
