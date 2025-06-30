export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).end("Method Not Allowed");

  const { SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN } = process.env;
  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: "Missing env vars" });
  }

  const baseURL = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-04`;
  const headers = { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN };

  try {
    let endpoint = `${baseURL}/orders.json?status=open&fields=id,line_items&limit=250`;
    let orders = [];

    while (endpoint) {
      const resp = await fetch(endpoint, { headers });
      const data = await resp.json();
      orders = orders.concat(data.orders);

      const link = resp.headers.get("link");
      const match = link && link.match(/<([^>]+)>;\s*rel="next"/);
      endpoint = match ? match[1] : null;
    }

    // Cache voor opgehaalde product-tags zodat we ze niet dubbel ophalen
    const productTagsCache = {};

    let queueLength = 0;

    for (const order of orders) {
      let containsLiveProduct = false;

      for (const item of order.line_items) {
        const productId = item.product_id;
        if (!productId) continue;

        // Haal tags van dit product op (of uit cache)
        if (!(productId in productTagsCache)) {
          const productResp = await fetch(
            `${baseURL}/products/${productId}.json?fields=tags`,
            { headers }
          );
          const productData = await productResp.json();
          const tags = productData.product?.tags || "";
          productTagsCache[productId] = tags;
        }

        const tags = productTagsCache[productId];
        if (tags.split(", ").includes("live")) {
          containsLiveProduct = true;
          break;
        }
      }

      if (containsLiveProduct) {
        queueLength++;
      }
    }

    res.status(200).json({ queueLength });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch orders or products" });
  }
}
