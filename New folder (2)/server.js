'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DB_PATH = path.resolve(process.env.DAVIPEL_DB_PATH || path.join(ROOT, 'data', 'davipel.sqlite'));
const PORT = Number(process.env.PORT || 3000);
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_PASSWORD_LENGTH = 256;
const SESSION_COOKIE = 'davipel_session';
const REGISTRATION_KEY = process.env.DAVIPEL_REGISTRATION_KEY;
const sessionSecure = process.env.NODE_ENV === 'production';
const SESSION_COOKIE_ATTRIBUTES = `Path=/; HttpOnly; SameSite=Strict${sessionSecure ? '; Secure' : ''}`;
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/backend.js', ['backend.js', 'text/javascript; charset=utf-8']]
]);
const ROLES = new Set([
  'cashier', 'merchant', 'merchandiser', 'dispatch', 'sales',
  'nationalSales', 'generalManager', 'plantManager', 'executive'
]);
const SELF_REGISTRATION_ROLES = new Set(['cashier', 'merchant', 'merchandiser']);
const ORDER_STATUSES = new Set(['Processing', 'Packed', 'In transit', 'Delivered', 'Short']);
const MANAGER_ROLES = new Set(['dispatch', 'sales', 'nationalSales', 'generalManager', 'plantManager', 'executive']);
const SHOP_ID_PATTERN = /^(FEED|SNACK)-\d{3}$/;
const ALLOWED_FEED_PRODUCTS = new Set([
  'Broiler Starter Crumbs', 'Broiler Grower Pellets', 'Broiler Finisher Pellets',
  'Layer Mesh', 'Layer Crumbs', 'Road Runner Mesh', 'Road Runner Crumbs'
]);
const ALLOWED_FEED_SIZES = new Set([5, 10, 50]);
const ALLOWED_FLAVORS = new Set(['Classic Salted', 'Cheese', 'Tomato', 'Chilli', 'BBQ']);
const PUBLIC_ACCOUNT_FIELDS = 'id, name, email, role, department, shop_id AS shopId';
const INITIAL_SHOPS = [
  { shop: 'Makoni Stock Feeds', id: 'FEED-001', department: 'Feeds', province: 'Manicaland', region: 'Eastern' },
  { shop: 'Mutoko Stock Feeds', id: 'FEED-002', department: 'Feeds', province: 'Mashonaland East', region: 'Eastern' },
  { shop: 'Bindura', id: 'FEED-003', department: 'Feeds', province: 'Mashonaland Central', region: 'Northern' },
  { shop: 'Chivhu', id: 'FEED-004', department: 'Feeds', province: 'Mashonaland East', region: 'Eastern' },
  { shop: 'Zvishavane', id: 'FEED-005', department: 'Feeds', province: 'Midlands', region: 'Central' },
  { shop: 'Gutu', id: 'FEED-006', department: 'Feeds', province: 'Masvingo', region: 'Southern' },
  { shop: 'Goromonzi Stock Feed Shop', id: 'FEED-007', department: 'Feeds', province: 'Mashonaland East', region: 'Eastern' },
  { shop: 'Hwedza', id: 'FEED-008', department: 'Feeds', province: 'Mashonaland East', region: 'Eastern' },
  { shop: 'Murambinda', id: 'FEED-009', department: 'Feeds', province: 'Manicaland', region: 'Eastern' },
  { shop: 'Whitehouse Stock Feeds', id: 'FEED-010', department: 'Feeds', province: 'Harare', region: 'Northern' },
  { shop: 'Jerera', id: 'FEED-011', department: 'Feeds', province: 'Masvingo', region: 'Southern' },
  { shop: 'Norton', id: 'FEED-012', department: 'Feeds', province: 'Mashonaland West', region: 'Western' },
  { shop: 'Marondera', id: 'FEED-013', department: 'Feeds', province: 'Mashonaland East', region: 'Eastern' },
  { shop: 'Showgrounds Harare', id: 'FEED-014', department: 'Feeds', province: 'Harare', region: 'Northern' },
  { shop: 'Bulawayo Warehouse', id: 'FEED-015', department: 'Feeds', province: 'Bulawayo', region: 'Western' },
  { shop: 'Bulawayo CBD', id: 'FEED-016', department: 'Feeds', province: 'Bulawayo', region: 'Western' },
  { shop: 'Dema', id: 'FEED-017', department: 'Feeds', province: 'Mashonaland East', region: 'Eastern' },
  { shop: 'Domboshava', id: 'FEED-018', department: 'Feeds', province: 'Harare', region: 'Northern' },
  { shop: 'Telesales Harare', id: 'FEED-019', department: 'Feeds', province: 'Harare', region: 'Northern' },
  { shop: 'Mvurwi', id: 'FEED-020', department: 'Feeds', province: 'Mashonaland Central', region: 'Northern' },
  { shop: 'Juru', id: 'FEED-021', department: 'Feeds', province: 'Mashonaland East', region: 'Eastern' },
  { shop: 'Mbudzi Harare', id: 'FEED-022', department: 'Feeds', province: 'Harare', region: 'Northern' },
  { shop: 'Esigodini', id: 'FEED-023', department: 'Feeds', province: 'Matabeleland South', region: 'Western' },
  { shop: 'Entumbane', id: 'FEED-024', department: 'Feeds', province: 'Bulawayo', region: 'Western' },
  { shop: 'Mutare', id: 'FEED-025', department: 'Feeds', province: 'Manicaland', region: 'Eastern' },
  { shop: 'Ngezi', id: 'FEED-026', department: 'Feeds', province: 'Mashonaland West', region: 'Western' },
  { shop: 'Tsholotsho', id: 'FEED-027', department: 'Feeds', province: 'Matabeleland North', region: 'Western' },
  { shop: 'Inyathi', id: 'FEED-028', department: 'Feeds', province: 'Matabeleland North', region: 'Western' },
  { shop: 'Mbare', id: 'SNACK-001', department: 'Snacks', province: 'Harare', region: 'Northern' },
  { shop: 'Showground Harare', id: 'SNACK-002', department: 'Snacks', province: 'Harare', region: 'Northern' },
  { shop: 'Makoni', id: 'SNACK-003', department: 'Snacks', province: 'Manicaland', region: 'Eastern' },
  { shop: 'Mbudzi Harare', id: 'SNACK-004', department: 'Snacks', province: 'Harare', region: 'Northern' },
  { shop: 'Machipisa', id: 'SNACK-005', department: 'Snacks', province: 'Harare', region: 'Northern' },
  { shop: 'Ruwa', id: 'SNACK-006', department: 'Snacks', province: 'Mashonaland East', region: 'Eastern' },
  { shop: 'Goromonzi', id: 'SNACK-007', department: 'Snacks', province: 'Mashonaland East', region: 'Eastern' },
  { shop: 'Whitehouse Harare', id: 'SNACK-008', department: 'Snacks', province: 'Harare', region: 'Northern' },
  { shop: 'Mtoko', id: 'SNACK-009', department: 'Snacks', province: 'Mashonaland East', region: 'Eastern' },
  { shop: 'Mvurwi', id: 'SNACK-010', department: 'Snacks', province: 'Mashonaland Central', region: 'Northern' },
  { shop: 'Juru', id: 'SNACK-011', department: 'Snacks', province: 'Mashonaland East', region: 'Eastern' },
  { shop: 'Telesales Harare', id: 'SNACK-012', department: 'Snacks', province: 'Harare', region: 'Northern' },
  { shop: 'BYO Cash Sales', id: 'SNACK-013', department: 'Snacks', province: 'Bulawayo', region: 'Western' },
  { shop: 'Gwanda', id: 'SNACK-014', department: 'Snacks', province: 'Matabeleland South', region: 'Western' },
  { shop: 'Esigodini', id: 'SNACK-015', department: 'Snacks', province: 'Matabeleland South', region: 'Western' },
  { shop: 'Entumbane', id: 'SNACK-016', department: 'Snacks', province: 'Bulawayo', region: 'Western' },
  { shop: 'Inyathi', id: 'SNACK-017', department: 'Snacks', province: 'Matabeleland North', region: 'Western' },
  { shop: 'Epworth', id: 'SNACK-018', department: 'Snacks', province: 'Harare', region: 'Northern' }
];

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL,
    department TEXT,
    shop_id TEXT,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,
    items_json TEXT NOT NULL,
    total TEXT,
    placed_by_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS shops (
    id TEXT PRIMARY KEY,
    shop TEXT NOT NULL,
    department TEXT NOT NULL CHECK (department IN ('Feeds', 'Snacks')),
    province TEXT NOT NULL,
    region TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS orders_shop_date_idx ON orders(shop_id, date);
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
`);
const seedShop = db.prepare(`
  INSERT OR IGNORE INTO shops (id, shop, department, province, region, active)
  VALUES (?, ?, ?, ?, ?, 1)
`);
db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
for (const shop of INITIAL_SHOPS) {
  seedShop.run(shop.id, shop.shop, shop.department, shop.province, shop.region);
}

function isKnownShopId(shopId, includeInactive = false) {
  return typeof shopId === 'string'
    && Boolean(db.prepare(
      `SELECT 1 FROM shops WHERE id = ? ${includeInactive ? '' : 'AND active = 1'}`
    ).get(shopId));
}

function shopFromRow(row) {
  return {
    id: row.id,
    shop: row.shop,
    department: row.department,
    province: row.province,
    region: row.region,
    active: row.active
  };
}

function accountFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department,
    shopId: row.shopId ?? row.shop_id ?? null
  };
}

function getAccountById(id) {
  return accountFromRow(db.prepare(`SELECT ${PUBLIC_ACCOUNT_FIELDS} FROM accounts WHERE id = ?`).get(id));
}

function getSessionToken(req) {
  const cookieHeader = req.headers.cookie || '';
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}

function getRequestAccount(req) {
  const sessionToken = getSessionToken(req);
  if (!sessionToken) return null;
  const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
  const session = db.prepare(
    'SELECT account_id AS accountId FROM sessions WHERE token_hash = ? AND expires_at > ?'
  ).get(tokenHash, Date.now());
  return session ? getAccountById(session.accountId) : null;
}

function createSession(res, accountId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  db.prepare('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)')
    .run(tokenHash, accountId, expiresAt);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; ${SESSION_COOKIE_ATTRIBUTES}; Max-Age=${SESSION_DURATION_MS / 1000}`);
}

function clearSession(req, res) {
  const account = getRequestAccount(req);
  if (account) {
    const token = getSessionToken(req);
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    }
  }
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; ${SESSION_COOKIE_ATTRIBUTES}; Max-Age=0`);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bodySize = 0;
    let tooLarge = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      if (tooLarge) return;
      bodySize += Buffer.byteLength(chunk, 'utf8');
      if (bodySize > MAX_BODY_BYTES) {
        tooLarge = true;
        body = '';
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        return;
      }
      try {
        const parsed = body ? JSON.parse(body) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(Object.assign(new Error('Request body must be a JSON object.'), { status: 400 }));
          return;
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(value));
}

function requireAccount(account) {
  if (!account) throw Object.assign(new Error('Sign in to continue.'), { status: 401 });
  return account;
}

function requireManager(account) {
  requireAccount(account);
  if (!MANAGER_ROLES.has(account.role)) {
    throw Object.assign(new Error('Your account cannot update order status.'), { status: 403 });
  }
}

function requireExecutive(account) {
  requireAccount(account);
  if (account.role !== 'executive') {
    throw Object.assign(new Error('Only an executive account can manage accounts.'), { status: 403 });
  }
}

async function createManagedAccount(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const role = body.role;
  const department = role === 'executive' ? null : body.department;
  const shopId = body.shopId || null;

  if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || password.length < 12 || password.length > MAX_PASSWORD_LENGTH || !ROLES.has(role)) {
    throw Object.assign(new Error('Enter a valid name and email, use a 12-character password, and choose a valid role.'), { status: 400 });
  }
  if (role !== 'executive' && !['Feeds', 'Snacks'].includes(department)) {
    throw Object.assign(new Error('Choose a valid department for this account.'), { status: 400 });
  }
  if (['cashier', 'merchant'].includes(role) && !isKnownShopId(shopId)) {
    throw Object.assign(new Error('Cashier and merchant accounts need an assigned shop.'), { status: 400 });
  }
  if (shopId && (!isKnownShopId(shopId)
    || shopId.startsWith('FEED-') !== (department === 'Feeds'))) {
    throw Object.assign(new Error('The assigned shop must match the selected department.'), { status: 400 });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await passwordHash(password, salt);
  const id = crypto.randomUUID();
  try {
    db.prepare(`
      INSERT INTO accounts (id, name, email, role, department, shop_id, salt, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, email, role, department, shopId, salt, hash, new Date().toISOString());
  } catch (error) {
    if (error.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/i.test(error.message)) {
      throw Object.assign(new Error('An account with this email already exists.'), { status: 409 });
    }
    throw error;
  }
  return getAccountById(id);
}

function createManagedShop(body) {
  const shop = typeof body.shop === 'string' ? body.shop.trim() : '';
  const department = body.department;
  const province = typeof body.province === 'string' ? body.province.trim() : '';
  const region = typeof body.region === 'string' ? body.region.trim() : '';
  if (shop.length < 2 || shop.length > 100 || !['Feeds', 'Snacks'].includes(department)
    || province.length < 2 || province.length > 80 || region.length < 2 || region.length > 80) {
    throw Object.assign(new Error('Enter a shop name, department, province, and region.'), { status: 400 });
  }

  const prefix = department === 'Feeds' ? 'FEED' : 'SNACK';
  const highestId = db.prepare(
    "SELECT MAX(CAST(SUBSTR(id, INSTR(id, '-') + 1) AS INTEGER)) AS number FROM shops WHERE id LIKE ?"
  ).get(`${prefix}-%`).number || 0;
  if (highestId >= 999) {
    throw Object.assign(new Error('No more shop IDs are available for this department.'), { status: 409 });
  }
  const id = `${prefix}-${String(highestId + 1).padStart(3, '0')}`;
  db.prepare('INSERT INTO shops (id, shop, department, province, region, active) VALUES (?, ?, ?, ?, ?, 1)')
    .run(id, shop, department, province, region);
  return shopFromRow(db.prepare('SELECT * FROM shops WHERE id = ?').get(id));
}

function visibleToAccount(account, shopId) {
  if (!isKnownShopId(shopId, true)) return false;
  if (account.role === 'executive') return true;
  const shopDepartment = shopId.startsWith('FEED-') ? 'Feeds' : 'Snacks';
  if (!account.department || account.department !== shopDepartment) return false;
  return !['cashier', 'merchant', 'merchandiser'].includes(account.role)
    || !account.shopId
    || account.shopId === shopId;
}

function orderFromRow(row) {
  return {
    id: row.id,
    shopId: row.shop_id,
    date: row.date,
    createdAt: row.created_at,
    status: row.status,
    items: JSON.parse(row.items_json),
    total: row.total,
    placedBy: JSON.parse(row.placed_by_json),
    demo: false
  };
}

function visibleOrders(account) {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  return orders
    .filter((order) => visibleToAccount(account, order.shop_id))
    .map(orderFromRow);
}

function validateItems(shopId, items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 40) {
    throw Object.assign(new Error('An order must contain between 1 and 40 items.'), { status: 400 });
  }
  const isFeedShop = shopId.startsWith('FEED-');
  let totalQuantity = 0;
  const normalizedItems = items.map((item) => {
    if (!item || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 500) {
      throw Object.assign(new Error('Each item quantity must be a whole number from 1 to 500.'), { status: 400 });
    }
    totalQuantity += item.quantity;
    if (isFeedShop) {
      if (!ALLOWED_FEED_PRODUCTS.has(item.product) || !ALLOWED_FEED_SIZES.has(item.packageSize)) {
        throw Object.assign(new Error('The order contains an invalid feed product or bag size.'), { status: 400 });
      }
      return { product: item.product, packageSize: item.packageSize, quantity: item.quantity };
    }
    if (!ALLOWED_FLAVORS.has(item.flavor)) {
      throw Object.assign(new Error('The order contains an invalid snack flavor.'), { status: 400 });
    }
    return { flavor: item.flavor, quantity: item.quantity };
  });
  if (totalQuantity > 2000) {
    throw Object.assign(new Error('An order cannot exceed 2,000 total units.'), { status: 400 });
  }
  return normalizedItems;
}

function passwordHash(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString('hex'));
    });
  });
}

function verifyPassword(password, salt, expectedHash) {
  return passwordHash(password, salt).then((actualHash) => {
    const actual = Buffer.from(actualHash, 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  });
}

function createOrder(account, shopId, items) {
  const shop = typeof shopId === 'string'
    ? db.prepare('SELECT active FROM shops WHERE id = ?').get(shopId)
    : null;
  if (!shop?.active || !visibleToAccount(account, shopId)
    || !['cashier', 'merchant', 'merchandiser'].includes(account.role)) {
    throw Object.assign(new Error('Your account cannot place orders for this shop.'), { status: 403 });
  }
  const safeItems = validateItems(shopId, items);
  const now = new Date();
  const id = `${shopId}-LIVE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const isFeedShop = shopId.startsWith('FEED-');
  const total = isFeedShop
    ? null
    : (safeItems.reduce((sum, item) => sum + item.quantity, 0) * 2.5).toFixed(2);
  const placedBy = { name: account.name, role: account.role, email: account.email };
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const createdAt = now.toISOString();
  db.prepare(`
    INSERT INTO orders (id, shop_id, date, created_at, status, items_json, total, placed_by_json)
    VALUES (?, ?, ?, ?, 'Processing', ?, ?, ?)
  `).run(id, shopId, date, createdAt, JSON.stringify(safeItems), total, JSON.stringify(placedBy));
  if (!account.shopId) {
    db.prepare('UPDATE accounts SET shop_id = ? WHERE id = ?').run(shopId, account.id);
  }
  return {
    order: orderFromRow(db.prepare('SELECT * FROM orders WHERE id = ?').get(id)),
    user: getAccountById(account.id)
  };
}

async function seedBootstrapAdmin() {
  const email = process.env.DAVIPEL_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DAVIPEL_BOOTSTRAP_ADMIN_PASSWORD;
  if (!email && !password) return;
  if (!email || !password || password.length < 12) {
    throw new Error('Set both bootstrap admin variables and use a password of at least 12 characters.');
  }
  if (db.prepare("SELECT 1 FROM accounts WHERE role = 'executive' LIMIT 1").get()) return;
  if (db.prepare('SELECT 1 FROM accounts WHERE email = ? COLLATE NOCASE').get(email)) {
    throw new Error('Bootstrap administrator email already belongs to another account; choose a different address.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await passwordHash(password, salt);
  db.prepare(`
    INSERT OR IGNORE INTO accounts (id, name, email, role, department, shop_id, salt, password_hash, created_at)
    VALUES (?, ?, ?, 'executive', NULL, NULL, ?, ?, ?)
  `).run(crypto.randomUUID(), 'Davipel Administrator', email, salt, hash, new Date().toISOString());
  console.log(`Bootstrap administrator created for ${email}.`);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const account = getRequestAccount(req);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, { status: 'ok', database: 'sqlite' });
    }

    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      return sendJson(res, 200, { user: account });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      if (!REGISTRATION_KEY) {
        throw Object.assign(new Error('Registration is disabled. Configure DAVIPEL_REGISTRATION_KEY on the server.'), { status: 503 });
      }
      const body = await readJson(req);
      const submittedKey = typeof body.registrationKey === 'string' ? Buffer.from(body.registrationKey) : Buffer.alloc(0);
      const expectedKey = Buffer.from(REGISTRATION_KEY);
      if (submittedKey.length !== expectedKey.length || !crypto.timingSafeEqual(submittedKey, expectedKey)) {
        throw Object.assign(new Error('The registration key is invalid.'), { status: 403 });
      }
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const department = body.department;
      const role = body.role;
      const shopId = body.shopId || null;
      if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || password.length < 12 || password.length > MAX_PASSWORD_LENGTH || !SELF_REGISTRATION_ROLES.has(role)) {
        throw Object.assign(new Error('Enter a valid name and email, use a 12-character password, and select an allowed staff role.'), { status: 400 });
      }
      if (!['Feeds', 'Snacks'].includes(department)) {
        throw Object.assign(new Error('Choose a valid department.'), { status: 400 });
      }
      if (['cashier', 'merchant'].includes(role) && !isKnownShopId(shopId)) {
        throw Object.assign(new Error('Choose a valid assigned shop in the selected department.'), { status: 400 });
      }
      if (shopId && (!isKnownShopId(shopId)
        || shopId.startsWith('FEED-') !== (department === 'Feeds'))) {
        throw Object.assign(new Error('Choose a valid assigned shop in the selected department.'), { status: 400 });
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = await passwordHash(password, salt);
      const id = crypto.randomUUID();
      try {
        db.prepare(`
          INSERT INTO accounts (id, name, email, role, department, shop_id, salt, password_hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, name, email, role, department, shopId, salt, hash, new Date().toISOString());
      } catch (error) {
        if (error.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/i.test(error.message)) {
          throw Object.assign(new Error('An account with this email already exists.'), { status: 409 });
        }
        throw error;
      }
      const newAccount = getAccountById(id);
      createSession(res, id);
      return sendJson(res, 201, { user: newAccount, orders: visibleOrders(newAccount) });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readJson(req);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const row = db.prepare('SELECT * FROM accounts WHERE email = ? COLLATE NOCASE').get(email);
      const valid = row && password.length <= MAX_PASSWORD_LENGTH
        ? await verifyPassword(password, row.salt, row.password_hash)
        : false;
      if (!valid) throw Object.assign(new Error('Email or password is incorrect.'), { status: 401 });
      const loggedInAccount = accountFromRow(row);
      createSession(res, row.id);
      return sendJson(res, 200, { user: loggedInAccount, orders: visibleOrders(loggedInAccount) });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      clearSession(req, res);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/accounts') {
      requireExecutive(account);
      const accounts = db.prepare(
        `SELECT ${PUBLIC_ACCOUNT_FIELDS} FROM accounts ORDER BY name COLLATE NOCASE`
      ).all();
      return sendJson(res, 200, { accounts });
    }

    if (req.method === 'POST' && url.pathname === '/api/accounts') {
      requireExecutive(account);
      const body = await readJson(req);
      const newAccount = await createManagedAccount(body);
      return sendJson(res, 201, { account: newAccount });
    }

    const accountMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)$/);
    if (req.method === 'DELETE' && accountMatch) {
      requireExecutive(account);
      const accountId = decodeURIComponent(accountMatch[1]);
      if (accountId === account.id) {
        throw Object.assign(new Error('You cannot remove your own executive account.'), { status: 400 });
      }
      const target = db.prepare('SELECT id, role FROM accounts WHERE id = ?').get(accountId);
      if (!target) throw Object.assign(new Error('Account not found.'), { status: 404 });
      if (target.role === 'executive'
        && db.prepare("SELECT COUNT(*) AS count FROM accounts WHERE role = 'executive'").get().count <= 1) {
        throw Object.assign(new Error('The last executive account cannot be removed.'), { status: 400 });
      }
      db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/shops') {
      requireAccount(account);
      const includeInactive = url.searchParams.get('includeInactive') === 'true';
      if (includeInactive) requireExecutive(account);
      const rows = db.prepare(
        `SELECT * FROM shops ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY department, shop COLLATE NOCASE`
      ).all();
      return sendJson(res, 200, { shops: rows.map(shopFromRow) });
    }

    if (req.method === 'POST' && url.pathname === '/api/shops') {
      requireExecutive(account);
      const body = await readJson(req);
      return sendJson(res, 201, { shop: createManagedShop(body) });
    }

    const shopMatch = url.pathname.match(/^\/api\/shops\/([^/]+)$/);
    if (req.method === 'DELETE' && shopMatch) {
      requireExecutive(account);
      const shopId = decodeURIComponent(shopMatch[1]);
      const shop = db.prepare('SELECT id FROM shops WHERE id = ? AND active = 1').get(shopId);
      if (!shop) throw Object.assign(new Error('Active shop not found.'), { status: 404 });
      if (db.prepare('SELECT 1 FROM accounts WHERE shop_id = ? LIMIT 1').get(shopId)) {
        throw Object.assign(new Error('Reassign or remove the accounts assigned to this shop before removing it.'), { status: 409 });
      }
      db.prepare('UPDATE shops SET active = 0 WHERE id = ?').run(shopId);
      return sendJson(res, 200, { ok: true });
    }

    const restoreShopMatch = url.pathname.match(/^\/api\/shops\/([^/]+)\/restore$/);
    if (req.method === 'POST' && restoreShopMatch) {
      requireExecutive(account);
      const shopId = decodeURIComponent(restoreShopMatch[1]);
      const result = db.prepare('UPDATE shops SET active = 1 WHERE id = ? AND active = 0').run(shopId);
      if (!result.changes) throw Object.assign(new Error('Removed shop not found.'), { status: 404 });
      return sendJson(res, 200, { shop: shopFromRow(db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId)) });
    }

    if (req.method === 'GET' && url.pathname === '/api/orders') {
      requireAccount(account);
      return sendJson(res, 200, { orders: visibleOrders(account) });
    }

    if (req.method === 'POST' && url.pathname === '/api/orders') {
      requireAccount(account);
      const body = await readJson(req);
      const created = createOrder(account, body.shopId, body.items);
      return sendJson(res, 201, created);
    }

    const statusMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
    if (req.method === 'PATCH' && statusMatch) {
      requireManager(account);
      const orderId = decodeURIComponent(statusMatch[1]);
      const body = await readJson(req);
      if (!ORDER_STATUSES.has(body.status)) {
        throw Object.assign(new Error('Choose a valid order status.'), { status: 400 });
      }
      const row = db.prepare('SELECT shop_id FROM orders WHERE id = ?').get(orderId);
      if (!row || !visibleToAccount(account, row.shop_id)) {
        throw Object.assign(new Error('Order not found.'), { status: 404 });
      }
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(body.status, orderId);
      return sendJson(res, 200, {
        order: orderFromRow(db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId))
      });
    }

    if (req.method === 'GET' && STATIC_FILES.has(url.pathname)) {
      const [filename, contentType] = STATIC_FILES.get(url.pathname);
      const filePath = path.join(ROOT, filename);
      return fs.readFile(filePath, (error, contents) => {
        if (error) {
          console.error(`Could not read ${filename}.`, error);
          return sendJson(res, 500, { error: 'Could not load the application.' });
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Cache-Control': 'no-cache'
        });
        res.end(contents);
      });
    }

    return sendJson(res, 404, { error: 'Route not found.' });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error('Request failed.', error);
    if (!res.headersSent) sendJson(res, status, { error: status >= 500 ? 'A server error occurred.' : error.message });
    else res.destroy();
  }
});

seedBootstrapAdmin().then(() => server.listen(PORT, '127.0.0.1', () => {
  console.log(`Davipel app available at http://127.0.0.1:${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
})).catch((error) => {
  console.error('Could not initialize the Davipel database.', error);
  db.close();
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
