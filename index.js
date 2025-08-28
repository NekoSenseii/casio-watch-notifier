import express from "express";
import fetch from "node-fetch";
import { Telegraf } from "telegraf";

const app = express();
app.use(express.json());

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // e.g., https://your-render-service.onrender.com/bot

// Basic stock check function
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
        process.env.TELEGRAM_CHAT_ID,
        "🎉 Casio AE-1200WHL-5AV is back in stock!"
      );
    }
  } catch (err) {
    console.error("❌ Error checking stock", err);
  }
}

// Set up webhook
bot.telegram.setWebhook(`${WEBHOOK_URL}/bot`);
app.use(bot.webhookCallback("/bot"));

// Optional: check stock on a schedule (can also use Render Cron Job)
setInterval(checkStock, 60_000);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
