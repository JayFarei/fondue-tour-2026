import { env } from 'cloudflare:workers';

export type { MediaRecord } from '@/lib/cheese-saver/media';

const COOKIE_NAME = 'cheese_saver_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

export type CheeseSaverBindings = {
  DB: D1Database;
  MEDIA: R2Bucket;
  CHEESE_SAVER_PASSWORD_SHA256?: string;
  CHEESE_SAVER_SESSION_SECRET?: string;
};

export function bindings() {
  return env as unknown as CheeseSaverBindings;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function signature(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

export function safeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function sessionSecret() {
  const secret = bindings().CHEESE_SAVER_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('CHEESE_SAVER_SESSION_SECRET is not configured');
  return secret;
}

export function passwordHash() {
  const hash = bindings().CHEESE_SAVER_PASSWORD_SHA256;
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) throw new Error('CHEESE_SAVER_PASSWORD_SHA256 is not configured');
  return hash.toLowerCase();
}

export async function createSessionToken(now = Date.now()) {
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  const payload = `v1.${expires}`;
  return `${payload}.${await signature(payload, sessionSecret())}`;
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

export async function isUnlocked(request: Request, now = Date.now()) {
  const token = cookieValue(request, COOKIE_NAME);
  if (!token) return false;
  const [version, expiresRaw, suppliedSignature] = token.split('.');
  const expires = Number(expiresRaw);
  if (version !== 'v1' || !Number.isSafeInteger(expires) || expires <= Math.floor(now / 1000) || !suppliedSignature) return false;
  const payload = `${version}.${expires}`;
  return safeEqual(suppliedSignature, await signature(payload, sessionSecret()));
}

export function sessionCookie(request: Request, token: string) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
}

export function expiredSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=0`;
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === new URL(request.url).origin);
}

export function apiResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function unauthorized() {
  return apiResponse({ error: 'PASSWORD_REQUIRED' }, { status: 401 });
}

async function subjectHash(request: Request) {
  const address = request.headers.get('cf-connecting-ip') ?? 'local';
  return sha256Hex(`${sessionSecret()}:${address}`);
}

export async function rateLimitStatus(request: Request, scope: string, maximum: number, windowSeconds: number) {
  const subject = await subjectHash(request);
  const now = Math.floor(Date.now() / 1000);
  const row = await bindings().DB.prepare(
    'SELECT window_start AS windowStart, attempts FROM cheese_rate_limits WHERE scope = ? AND subject_hash = ?',
  ).bind(scope, subject).first<{ windowStart: number; attempts: number }>();
  if (!row || now - row.windowStart >= windowSeconds) return { blocked: false, subject, now };
  return { blocked: row.attempts >= maximum, subject, now };
}

export async function recordRateLimit(scope: string, subject: string, now: number, windowSeconds: number) {
  await bindings().DB.prepare(
    `INSERT INTO cheese_rate_limits (scope, subject_hash, window_start, attempts)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(scope, subject_hash) DO UPDATE SET
       attempts = CASE WHEN excluded.window_start - cheese_rate_limits.window_start >= ? THEN 1 ELSE cheese_rate_limits.attempts + 1 END,
       window_start = CASE WHEN excluded.window_start - cheese_rate_limits.window_start >= ? THEN excluded.window_start ELSE cheese_rate_limits.window_start END`,
  ).bind(scope, subject, now, windowSeconds, windowSeconds).run();
}

export async function consumeRateLimit(request: Request, scope: string, maximum: number, windowSeconds: number) {
  const subject = await subjectHash(request);
  const now = Math.floor(Date.now() / 1000);
  const row = await bindings().DB.prepare(
    `INSERT INTO cheese_rate_limits (scope, subject_hash, window_start, attempts)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(scope, subject_hash) DO UPDATE SET
       attempts = CASE WHEN excluded.window_start - cheese_rate_limits.window_start >= ? THEN 1 ELSE cheese_rate_limits.attempts + 1 END,
       window_start = CASE WHEN excluded.window_start - cheese_rate_limits.window_start >= ? THEN excluded.window_start ELSE cheese_rate_limits.window_start END
     RETURNING attempts`,
  ).bind(scope, subject, now, windowSeconds, windowSeconds).first<{ attempts: number }>();
  return { blocked: !row || row.attempts > maximum };
}

export async function clearRateLimit(scope: string, subject: string) {
  await bindings().DB.prepare(
    'DELETE FROM cheese_rate_limits WHERE scope = ? AND subject_hash = ?',
  ).bind(scope, subject).run();
}

export async function requireUnlocked(request: Request) {
  try {
    return await isUnlocked(request);
  } catch {
    return false;
  }
}
