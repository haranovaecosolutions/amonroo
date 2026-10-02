type ApiObject = Record<string, unknown>;
type Inventory = ApiObject & {
  inventory_id?: number | string;
  name?: string;
  is_default?: boolean;
  default_warehouse?: string;
  warehouses?: string[];
};

type InventoryProduct = ApiObject & {
  id?: number | string;
  sku?: string;
  name?: string;
  stock?: Record<string, number | string>;
  thresholds?: Record<string, number | string>;
};

function objectEntries(value: unknown): [string, ApiObject][] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).filter((entry): entry is [string, ApiObject] => Boolean(entry[1]) && typeof entry[1] === 'object' && !Array.isArray(entry[1]));
}

function numericValue(value: unknown, fallback = 0) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : fallback;
}

function textValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

async function callBaseLinker(method: string, parameters: ApiObject = {}) {
  const token = process.env.BASELINKER_API_TOKEN;
  if (!token) throw new Error('BaseLinker API is not configured. Set BASELINKER_API_TOKEN on the server.');

  const response = await fetch('https://api.baselinker.com/connector.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-BLToken': token,
    },
    body: new URLSearchParams({ method, parameters: JSON.stringify(parameters) }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`BaseLinker returned HTTP ${response.status} for ${method}.`);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`BaseLinker returned an invalid response for ${method}.`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`BaseLinker returned an invalid response for ${method}.`);
  }

  const result = payload as ApiObject;
  if (result.status !== 'SUCCESS') {
    const message = textValue(result.error_message) || textValue(result.error_code) || 'Unknown API error.';
    throw new Error(`BaseLinker ${method} failed: ${message}`);
  }
  return result;
}

async function resolveInventory() {
  const result = await callBaseLinker('getInventories');
  const inventories = Array.isArray(result.inventories) ? result.inventories as Inventory[] : [];
  const configuredId = process.env.BASELINKER_INVENTORY_ID;
  const inventory = configuredId
    ? inventories.find((item) => String(item.inventory_id) === configuredId)
    : inventories.find((item) => item.is_default === true) ?? (inventories.length === 1 ? inventories[0] : undefined);

  if (!inventory) {
    throw new Error(configuredId
      ? 'The configured BaseLinker inventory was not found.'
      : 'BaseLinker has multiple inventories and no default. Set BASELINKER_INVENTORY_ID.');
  }

  const configuredWarehouse = process.env.BASELINKER_WAREHOUSE_ID;
  const warehouseId = configuredWarehouse || inventory.default_warehouse || '';
  if (!warehouseId || (inventory.warehouses && !inventory.warehouses.includes(warehouseId))) {
    throw new Error('The selected BaseLinker inventory has no matching default warehouse. Set BASELINKER_WAREHOUSE_ID.');
  }
  return { inventoryId: numericValue(inventory.inventory_id), warehouseId };
}

export async function getBaseLinkerProducts() {
  const { inventoryId, warehouseId } = await resolveInventory();
  const listedProducts: InventoryProduct[] = [];
  const maxPages = 50;

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await callBaseLinker('getInventoryProductsList', { inventory_id: inventoryId, page, include_variants: true });
    const entries = objectEntries(result.products);
    listedProducts.push(...entries.map(([id, product]) => ({ ...product, id: textValue(product.id) || id })));
    if (entries.length < 1000) break;
    if (page === maxPages) throw new Error('BaseLinker inventory exceeds the live display limit of 50,000 products.');
  }

  const productDetails = new Map<string, ApiObject>();
  const batches = Array.from({ length: Math.ceil(listedProducts.length / 100) }, (_, index) => listedProducts.slice(index * 100, (index + 1) * 100));
  for (let start = 0; start < batches.length; start += 5) {
    const results = await Promise.all(batches.slice(start, start + 5).map((batch) => callBaseLinker('getInventoryProductsData', {
      inventory_id: inventoryId,
      products: batch.map((product) => numericValue(product.id)),
    })));
    for (const result of results) {
      for (const [id, detail] of objectEntries(result.products)) productDetails.set(id, detail);
    }
  }

  const fallbackThreshold = Math.max(0, numericValue(process.env.BASELINKER_LOW_STOCK_FALLBACK, 5));
  return listedProducts.map((product) => {
    const id = textValue(product.id);
    const detail = productDetails.get(id) ?? {};
    const stock = (detail.stock as Record<string, unknown> | undefined) ?? product.stock;
    const thresholds = (detail.thresholds as Record<string, unknown> | undefined) ?? product.thresholds;
    const currentStock = numericValue(stock?.[warehouseId]);
    const configuredThreshold = numericValue(thresholds?.[warehouseId], 0);
    const reorderLevel = configuredThreshold > 0 ? configuredThreshold : fallbackThreshold;
    const sku = textValue(detail.sku) || textValue(product.sku) || id;
    const name = textValue(detail.name) || textValue(product.name) || sku;

    return {
      id,
      sku,
      name,
      current_stock: currentStock,
      stock: currentStock,
      reorder_level: reorderLevel,
      reorder: reorderLevel,
      shortage: Math.max(reorderLevel - currentStock, 0),
      warehouse_id: warehouseId,
      warehouse_name: warehouseId,
      source: 'baselinker',
    };
  });
}

function unixDate(value: unknown) {
  const timestamp = numericValue(value);
  return timestamp > 0 ? new Date(timestamp * 1000).toISOString() : '';
}

function productLines(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is ApiObject => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  return objectEntries(value).map(([, item]) => item);
}

function isOpenStatus(status: string) {
  const normalized = status.toLowerCase();
  if (/not delivered|undelivered|return initiated|return pending/.test(normalized)) return true;
  return !/(complete|fulfilled|delivered|cancel|closed|finished|done|\brto\b|zrealiz|anul|zakoncz)/i.test(normalized);
}

export async function getBaseLinkerOrders() {
  const [statusResult] = await Promise.all([callBaseLinker('getOrderStatusList')]);
  const statuses = Array.isArray(statusResult.statuses) ? statusResult.statuses as ApiObject[] : [];
  const statusNames = new Map(statuses.map((status) => [textValue(status.id), textValue(status.name)]));
  const dateFrom = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
  const allOrders = new Map<string, ApiObject>();
  let idFrom: number | undefined;

  for (let page = 0; page < 50; page += 1) {
    const parameters: ApiObject = { date_from: dateFrom, get_unconfirmed_orders: true };
    if (idFrom !== undefined) parameters.id_from = idFrom;
    const result = await callBaseLinker('getOrders', parameters);
    const orders = Array.isArray(result.orders) ? result.orders as ApiObject[] : [];
    for (const order of orders) {
      const id = textValue(order.order_id);
      if (id) allOrders.set(id, order);
    }
    if (orders.length < 100) break;

    const maxId = Math.max(...orders.map((order) => numericValue(order.order_id)));
    if (!Number.isSafeInteger(maxId) || (idFrom !== undefined && maxId < idFrom)) {
      throw new Error('BaseLinker order pagination returned an invalid order ID.');
    }
    idFrom = maxId + 1;
    if (page === 49) throw new Error('BaseLinker returned more than 5,000 orders for the last 90 days.');
  }

  return [...allOrders.values()]
    .map((order) => {
      const id = textValue(order.order_id);
      const lines = productLines(order.products);
      const quantity = lines.reduce((sum, line) => sum + numericValue(line.quantity), 0);
      const status = statusNames.get(textValue(order.order_status_id)) || `Status ${textValue(order.order_status_id)}`;
      const orderNumber = textValue(order.shop_order_id) || textValue(order.external_order_id) || id;
      const productTotal = lines.reduce((sum, line) => sum + numericValue(line.price_brutto) * numericValue(line.quantity), 0);
      const deliveryPrice = numericValue(order.delivery_price);

      return {
        id,
        order_number: orderNumber,
        base_order_id: id,
        customer_name: textValue(order.delivery_fullname) || textValue(order.invoice_fullname) || textValue(order.user_login) || textValue(order.email),
        email: textValue(order.email),
        phone: textValue(order.phone),
        ordered_at: unixDate(order.date_add),
        confirmed_at: unixDate(order.date_confirmed),
        deadline: null,
        status,
        status_id: textValue(order.order_status_id),
        is_open: isOpenStatus(status),
        order_source: textValue(order.order_source_info) || textValue(order.order_source),
        currency: textValue(order.currency),
        total_price: numericValue(order.total_price, productTotal + deliveryPrice),
        payment_done: numericValue(order.payment_done),
        payment_method: textValue(order.payment_method),
        delivery_method: textValue(order.delivery_method),
        tracking_number: textValue(order.delivery_package_nr),
        delivery_city: textValue(order.delivery_city),
        product_sku: textValue(lines[0]?.sku),
        product_name: textValue(lines[0]?.name),
        quantity_ordered: quantity,
        total_quantity: quantity,
        outstanding_quantity: isOpenStatus(status) ? quantity : 0,
        line_count: lines.length,
        products: lines.map((line) => ({
          sku: textValue(line.sku),
          name: textValue(line.name),
          quantity: numericValue(line.quantity),
          unit_price: numericValue(line.price_brutto),
          currency: textValue(order.currency),
        })),
        source: 'baselinker',
      };
    })
    .sort((left, right) => right.ordered_at.localeCompare(left.ordered_at));
}
