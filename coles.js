import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { setTimeout } from "node:timers/promises";
import fs from "fs/promises";

puppeteer.use(StealthPlugin());

function normalize(text) {
  return (text || "").trim().toLowerCase();
}

async function loadProductsList(path) {
  const raw = await fs.readFile(path, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function scrapeSearchResults(page, term) {
  const url = `https://www.coles.com.au/search/products?q=${encodeURIComponent(
    term
  )}`;
  await page.goto(url, { waitUntil: "load" });
  await setTimeout(1000);

  const items = [];
  const seen = new Set();

  while (true) {
    await page.waitForSelector("[data-testid=product-tile]", { timeout: 10000 });

    const productHandles = await page.$$('[data-testid="product-tile"]');

    for (const producthandle of productHandles) {
      let title = "";
      let price = "";
      let image = "";
      let productId = "";

      try {
        title = await page.evaluate(
          (el) => el.querySelector(".product__title")?.textContent?.trim() ?? "",
          producthandle
        );
      } catch {}

      try {
        price = await page.evaluate(
          (el) => el.querySelector(".price__value")?.textContent?.trim() ?? "",
          producthandle
        );
      } catch {}

      try {
        image = await page.evaluate(
          (el) =>
            el.querySelector("[data-testid=product-image]")?.getAttribute("src") || "",
          producthandle
        );
      } catch {}

      try {
        productId = await page.evaluate(
          (el) =>
            el
              .querySelector(".product__link.product__image")
              ?.getAttribute("href") ||
            "",
          producthandle
        );
      } catch {}

      const normalizedTitle = normalize(title);
      if (!normalizedTitle.includes(normalize(term))) continue;

      const key = `${productId}|${normalizedTitle}`;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        term,
        title,
        price,
        image,
        productId,
        url: productId ? `https://www.coles.com.au${productId}` : "",
      });
    }

    const nextBtn = await page.$("#pagination-button-next");
    if (!nextBtn) break;

    const disabled = await page.evaluate(
      (el) => el.getAttribute("aria-disabled") === "true",
      nextBtn
    );
    if (disabled) break;

    await Promise.all([
      nextBtn.click(),
      page.waitForNavigation({ waitUntil: "networkidle2" }),
    ]);
  }

  return items;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--enable-features=NetworkService,NetworkServiceInProcess"],
  });
  const page = await browser.newPage();

  const context = browser.defaultBrowserContext();
  await context.overridePermissions("https://www.coles.com.au", ["geolocation"]);
  await page.setGeolocation({ latitude: -33.8688, longitude: 151.2093 });

  const terms = await loadProductsList("products.txt");
  const allItems = [];

  for (const term of terms) {
    console.log("Searching for:", term);
    const results = await scrapeSearchResults(page, term);
    console.log(`  found ${results.length} matching products`);
    allItems.push(...results);
  }

  const outPath = "coles-product.json";
  await fs.writeFile(outPath, JSON.stringify(allItems, null, 2), "utf8");
  console.log(`Saved ${allItems.length} items to ${outPath}`);

  await browser.close();
})();
