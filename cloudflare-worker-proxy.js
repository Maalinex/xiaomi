/**
 * 🌉 واسطهٔ Cloudflare برای Supabase — نسخهٔ ۱
 * اپ شیائومی به این Worker وصل می‌شود و Worker از شبکهٔ Cloudflare به Supabase می‌رسد.
 * نتیجه: کاربرها بدون VPN کار می‌کنند؛ داده همان‌جا در Supabase می‌ماند.
 *
 * نصب (یک‌بار، با VPN):
 *  1) dash.cloudflare.com → Workers & Pages → Create → Create Worker → اسم مثلاً xiaomi-bridge
 *  2) Edit code → همهٔ این فایل را جای کد پیش‌فرض بگذار → Deploy
 *  3) (اختیاری ولی توصیه‌شده) Settings → Variables → SUPABASE_HOST = rybcusmcwwifciciuvvv.supabase.co
 *  4) آدرس Worker را بردار (مثلاً https://xiaomi-bridge.USERNAME.workers.dev)
 *     — اگر دامنهٔ خودت روی Cloudflare است، در Settings → Domains & Routes یک ساب‌دامنه اضافه کن (پایدارتر).
 *  5) آدرس را در اپ، صفحهٔ ورود → «تنظیمات اتصال» → «آدرس واسطه» بگذار (یا به من بده تا در نسخهٔ بعد ثابت شود).
 */

const DEFAULT_HOST = 'rybcusmcwwifciciuvvv.supabase.co';

export default {
  async fetch(request, env) {
    const host = (env && env.SUPABASE_HOST) || DEFAULT_HOST;
    const inUrl = new URL(request.url);

    // صفحهٔ سلامت — برای تست سریع از مرورگر
    if (inUrl.pathname === '/' || inUrl.pathname === '/__health') {
      return new Response('xiaomi-bridge ok → ' + host, {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8', ...cors(request) },
      });
    }

    // پاسخ preflight مرورگر
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(request) });
    }

    // آدرس مقصد: همان مسیر و پارامترها روی Supabase
    const target = new URL(request.url);
    target.protocol = 'https:';
    target.hostname = host;
    target.port = '';

    // هدرها: هدرهای Cloudflare و Host حذف، بقیه (apikey, authorization, content-type…) عبور
    const headers = new Headers(request.headers);
    ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip']
      .forEach(h => headers.delete(h));
    headers.set('host', host);

    // 🔌 Realtime (WebSocket): درخواست Upgrade عیناً عبور داده می‌شود
    const upgrade = (request.headers.get('upgrade') || '').toLowerCase();
    if (upgrade === 'websocket') {
      return fetch(target.toString(), { method: request.method, headers });
    }

    const init = {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    };

    let resp;
    try {
      resp = await fetch(target.toString(), init);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'bridge_upstream_failed', message: String(e && e.message || e) }), {
        status: 502, headers: { 'content-type': 'application/json', ...cors(request) },
      });
    }

    // پاسخ را با هدرهای CORS مناسب برگردان
    const out = new Headers(resp.headers);
    const c = cors(request);
    Object.keys(c).forEach(k => out.set(k, c[k]));
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: out });
  },
};

function cors(request) {
  const origin = request.headers.get('origin') || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
    'access-control-allow-headers': request.headers.get('access-control-request-headers') || 'apikey, authorization, content-type, x-client-info, prefer, range, x-upsert, accept, accept-profile, content-profile, x-supabase-api-version',
    'access-control-expose-headers': 'content-range, range, x-total-count, location',
    'access-control-max-age': '86400',
    'vary': 'origin',
  };
}
