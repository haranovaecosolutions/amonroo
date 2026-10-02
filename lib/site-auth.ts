const SESSION_COOKIE = 'amonroo_site_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;
const SESSION_PURPOSE = 'amonroo-inventory-site-session';

function encodeBase64Url(bytes: ArrayBuffer) {
  const binary = Array.from(new Uint8Array(bytes), (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getSigningKey() {
  const secret = process.env.INVENTORY_SESSION_SECRET;
  if (!secret) return null;
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createSiteSessionToken() {
  const key = await getSigningKey();
  if (!key) throw new Error('INVENTORY_SESSION_SECRET is not configured.');

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `${SESSION_PURPOSE}:${expiresAt}`;
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${expiresAt}.${encodeBase64Url(signature)}`;
}

export async function verifySiteSessionToken(token: string | undefined) {
  if (!token) return false;

  const [expiresAtValue, signatureValue, extra] = token.split('.');
  if (!expiresAtValue || !signatureValue || extra !== undefined || !/^\d+$/.test(expiresAtValue)) return false;
  const expiresAt = Number(expiresAtValue);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const key = await getSigningKey();
  if (!key) return false;

  try {
    const signature = decodeBase64Url(signatureValue);
    return await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(`${SESSION_PURPOSE}:${expiresAt}`),
    );
  } catch {
    return false;
  }
}

export { SESSION_COOKIE, SESSION_MAX_AGE };
