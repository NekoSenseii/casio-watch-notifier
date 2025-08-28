// Stock check function (Bhawar Shopify store)
async function checkStock() {
  try {
    // 1) Try product JSON first (may expose variant.available)
    const pj = await fetch(
      "https://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383.json",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!pj.ok) throw new Error(`product.json HTTP ${pj.status}`);
    const pdata = await pj.json();
    const variant = pdata?.product?.variants?.;

    // If store exposes availability flag, use it
    if (typeof variant?.available === "boolean") {
      if (variant.available) {
        console.log("✅ Stock available via product JSON");
        await bot.telegram.sendMessage(
          CHAT_ID,
          "🎉 Casio AE-1200WHL-5AV is back in stock at Bhawar!\nhttps://casiostore.bhawar.com/products/casio-youth-ae-1200whl-5avdf-black-digital-dial-brown-leather-band-d383"
        );
      } else {
        console.log("⏳ Still sold out (product JSON)");
      }
      return;
    }

    // 2) Fallback probe: add-to-cart (treat 422 as sold out)
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

    const txt = await res.text();
    console.error(`❌ Unexpected add.js response ${res.status}: ${txt}`);
  } catch (err) {
    // Special handling for DNS issues
    if (err.code === "ENOTFOUND") {
      console.error("❌ DNS ENOTFOUND for target host; will retry next cycle");
      return;
    }
    console.error("❌ Error checking stock", err);
  }
}
