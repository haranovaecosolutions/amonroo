type ApiObject = Record<string, unknown>;

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
