#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http"; // === HTTP CART VIEW ===

// -------------------------
// Chargement des pizzas
// -------------------------
/**
 * Deux formats supportés :
 *  - JSON (.json) : tableau d'objets { name, ingredients[], price, allergens[] }
 *  - Texte (autre extension) : une pizza par ligne, format :
 *      name | price | ingredient1,ingredient2 | allergen1,allergen2
 *    Les virgules séparent les listes ; espaces tolérés.
 */
async function loadPizzas(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  if (path.extname(filePath).toLowerCase() === ".json") {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error("Le JSON doit être un tableau.");
    return data.map(normalizePizza);
  }
  // format texte
  const lines = raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"));

  const pizzas = lines.map((line, idx) => {
    const parts = line.split("|").map(p => p.trim());
    if (parts.length < 4) {
      throw new Error(
        `Ligne ${idx + 1}: format attendu "name | price | ingredients | allergens"`
      );
    }
    const [name, priceStr, ingredientsStr, allergensStr] = parts;
    const price = Number(priceStr.replace(",", "."));
    if (Number.isNaN(price)) {
      throw new Error(`Ligne ${idx + 1}: prix invalide "${priceStr}"`);
    }
    const ingredients = splitList(ingredientsStr);
    const allergens = splitList(allergensStr);
    return normalizePizza({ name, price, ingredients, allergens });
  });

  return pizzas;
}

function splitList(s) {
  return s
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function normalizePizza(p) {
  return {
    name: String(p.name).trim(),
    price: Number(p.price),
    ingredients: Array.isArray(p.ingredients)
      ? p.ingredients.map(String)
      : [],
    allergens: Array.isArray(p.allergens)
      ? p.allergens.map(String)
      : []
  };
}

// -------------------------
// État du serveur (mémoire)
// -------------------------
const server = new McpServer({ name: "mcp-js", version: "0.1.0" });

// Le chemin du fichier pizzas peut être passé par env ou argument
const PIZZAS_FILE =
  process.env.PIZZAS_FILE ||
  process.argv.find(a => a.startsWith("--pizzas="))?.split("=", 2)[1] ||
  "./pizzas.json";

let PIZZAS = [];
/** Panier : Map<nameLower, { name, unitPrice, quantity }> */
const CART = new Map();

function findPizzaByName(name) {
  const n = name.trim().toLowerCase();
  return PIZZAS.find(p => p.name.toLowerCase() === n) || null;
}

function cartToArray() {
  return Array.from(CART.values()).map(item => ({
    name: item.name,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    lineTotal: round2(item.unitPrice * item.quantity)
  }));
}

function cartTotals() {
  const items = cartToArray();
  const subtotal = round2(items.reduce((s, it) => s + it.lineTotal, 0));
  return { items, subtotal, currency: "EUR" };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// -------------------------
// Tools
// -------------------------

// 1) list_pizzas
server.registerTool(
  "list_pizzas",
  {
    title: "Lister les pizzas",
    description:
      "Retourne la liste des pizzas disponibles avec ingrédients, allergènes et prix.",
    inputSchema: {
      // filtres optionnels
      maxPrice: z.number().optional(),
      excludeAllergens: z.array(z.string()).optional(),
      includeIngredients: z.array(z.string()).optional()
    }
  },
  async ({ maxPrice, excludeAllergens, includeIngredients }) => {
    let list = [...PIZZAS];

    if (typeof maxPrice === "number") {
      list = list.filter(p => p.price <= maxPrice);
    }
    if (excludeAllergens?.length) {
      const ex = new Set(excludeAllergens.map(a => a.toLowerCase()));
      list = list.filter(
        p => !p.allergens.some(a => ex.has(String(a).toLowerCase()))
      );
    }
    if (includeIngredients?.length) {
      const need = includeIngredients.map(i => i.toLowerCase());
      list = list.filter(p => {
        const have = p.ingredients.map(i => i.toLowerCase());
        return need.every(n => have.includes(n));
      });
    }

    return {
      content: [
		{ type: "text", text: JSON.stringify({ pizzas: list }, null, 2) },
      ]
    };
  }
);

// 2) add_to_cart
server.registerTool(
  "add_to_cart",
  {
    title: "Ajouter une pizza au panier",
    description: "Ajoute une pizza au panier par nom, avec une quantité.",
    inputSchema: {
      name: z.string(),
      quantity: z.number().int().min(1).default(1)
    }
  },
  async ({ name, quantity }) => {
    const pizza = findPizzaByName(name);
    if (!pizza) {
      return {
        content: [
          {
            type: "text",
            text: `Pizza introuvable: "${name}". Utilise 'list_pizzas' pour voir les noms.`
          }
        ],
        isError: true
      };
    }
    const key = pizza.name.toLowerCase();
    const current = CART.get(key) || {
      name: pizza.name,
      unitPrice: pizza.price,
      quantity: 0
    };
    current.quantity += quantity;
    CART.set(key, current);

    const totals = cartTotals();
    return {
      content: [
        { type: "text", text: `Ajouté: ${quantity} × ${pizza.name}` },
      ]
    };
  }
);

// 3) remove_from_cart
server.registerTool(
  "remove_from_cart",
  {
    title: "Retirer une pizza du panier",
    description:
      "Retire une quantité de la pizza du panier. Si la quantité atteint 0, la ligne est supprimée.",
    inputSchema: {
      name: z.string(),
      quantity: z.number().int().min(1).default(1)
    }
  },
  async ({ name, quantity }) => {
    const key = name.trim().toLowerCase();
    const current = CART.get(key);
    if (!current) {
      return {
        content: [
          { type: "text", text: `Cette pizza n'est pas dans le panier: "${name}"` }
        ],
        isError: true
      };
    }
    current.quantity -= quantity;
    if (current.quantity <= 0) {
      CART.delete(key);
    } else {
      CART.set(key, current);
    }

    const totals = cartTotals();
    return {
      content: [
        { type: "text", text: `Retiré: ${quantity} × ${current.name}` },
      ]
    };
  }
);

// 4) get_cart
server.registerTool(
  "get_cart",
  {
    title: "Contenu et montant du panier",
    description: "Retourne le contenu du panier et le total.",
    inputSchema: {}
  },
  async () => {
    const totals = cartTotals();
    return { content: [{ type: "text", text: JSON.stringify({ cart: totals }, null, 2) }] };
  }
);

// -------------------------
// Boot
// -------------------------
console.error(`[mcp-js] chargement des pizzas depuis: ${PIZZAS_FILE}`);
try {
  PIZZAS = await loadPizzas(PIZZAS_FILE);
  console.error(`[mcp-js] ${PIZZAS.length} pizza(s) chargée(s).`);
} catch (err) {
  console.error(`[mcp-js] ERREUR chargement pizzas:`, err);
  process.exit(1);
}

console.error("[mcp-js] starting…");
const transport = new StdioServerTransport();
await server.connect(transport);


// -------------------------
// === HTTP CART VIEW ===
// -------------------------
const HTTP_PORT = Number(process.env.PORT || 8787);
const HTTP_HOST = process.env.HOST || "0.0.0.0";

function renderCartHtml() {
  const { items, subtotal, currency } = cartTotals();
  const rows =
    items.length === 0
      ? `<tr><td colspan="4" style="text-align:center;padding:16px;color:#666">Panier vide</td></tr>`
      : items
          .map(
            it => `
      <tr>
        <td>${escapeHtml(it.name)}</td>
        <td style="text-align:right">${it.unitPrice.toFixed(2)} ${currency}</td>
        <td style="text-align:right">${it.quantity}</td>
        <td style="text-align:right">${it.lineTotal.toFixed(2)} ${currency}</td>
      </tr>`
          )
          .join("");

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Panier — mcp-js</title>
  <meta http-equiv="refresh" content="10"> <!-- auto-refresh toutes les 10s -->
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji','Segoe UI Emoji'; }
    body { margin: 24px; color: #111; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    .card { max-width: 800px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; box-shadow: 0 1px 2px rgba(0,0,0,.04); background: #fff; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #eee; }
    th { text-align: left; font-weight: 600; color: #374151; }
    tfoot td { font-weight: 700; }
    .muted { color: #6b7280; font-size: 12px; margin-top: 8px; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🛒 Panier</h1>
    <table>
      <thead>
        <tr>
          <th>Pizza</th>
          <th style="text-align:right">Prix unitaire</th>
          <th style="text-align:right">Qté</th>
          <th style="text-align:right">Total ligne</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="text-align:right">Sous-total</td>
          <td style="text-align:right">${subtotal.toFixed(2)} ${currency}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</body>
</html>`;
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const httpServer = http.createServer((req, res) => {
  // routes simples
  if (req.method === "GET" && (req.url === "/" || req.url === "/cart")) {
    const html = renderCartHtml();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  if (req.method === "GET" && req.url === "/api/cart.json") {
    const payload = { cart: cartTotals() };
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

httpServer.listen(HTTP_PORT, HTTP_HOST, () => {
  console.error(`[mcp-js] HTTP prêt sur http://${HTTP_HOST}:${HTTP_PORT}/cart`);
});
