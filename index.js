const form = new URLSearchParams({ id: "50750514037017", quantity: "1" });
const res = await fetch("https://casiostore.bhawar.com/cart/add.js", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0",
    "Referer":
      "https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383",
    "X-Requested-With": "XMLHttpRequest"
  },
  body: form
});
if (res.status === 422) {
  console.log("⏳ Still sold out (422 from cart/add.js)");
  return;
}
if (res.ok) {
  console.log("✅ Stock available via cart/add.js");
  await bot.telegram.sendMessage(
    CHAT_ID,
    "🎉 Casio AE-1200WHL-5AV is back in stock at Bhawar!\nhttps://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383"
  );
  return;
}
