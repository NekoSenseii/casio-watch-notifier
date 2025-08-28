import express from "express";
import fetch from "node-fetch";
import { Telegraf } from "telegraf";

const app = express();
app.use(express.json());

// Environment variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // e.g., https://casio-watch-notifier.onrender.com
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !CHAT_ID || !WEBHOOK_URL) {
  console.error("❌ Missing required environment variables!");
  process.exit(1);
}

// Initialize bot
const bot = new Telegraf(BOT_TOKEN);

// Health check route
app.get("/", (req, res) => {
  res.send("Bot server is running!");
});

// Stock check function
async function checkStock() {
  try {
    const res = await fetch("https://shop.casio.in/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 1, id: 123456789 }) // replace with real variant_id
    });
    const data = await res.json();

    if (data.status === 422) {
      console.log("⏳ Still sold out");
    } else {
      console.log("✅ Stock available!");
      await bot.telegram.sendMessage(
        CHAT_ID,
        "🎉 Casio AE-1200WHL-5AV is back in stock!"
      );
    }
  } catch (err) {
    console.error("❌ Error checking stock", err);
  }
}

// Set up webhook
const webhookPath = "/bot";
bot.telegram.setWebhook(`${WEBHOOK_URL}${webhookPath}`);
app.use(webhookPath, bot.webhookCallback(webhookPath));

// Optional: check stock every 60 seconds (or use Render cron jobs)
setInterval(checkStock, 60_000);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Webhook URL: ${WEBHOOK_URL}${webhookPath}`);
});
