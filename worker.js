const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const ALLOWED_ORIGIN = 'https://fendou986-arch.github.io';
const CACHE_KEY = new Request('https://war-zone-news-proxy.internal/news');
const RSS_FEEDS = [
  ['BBC', 'https://feeds.bbci.co.uk/news/world/rss.xml'],
  ['DW', 'https://rss.dw.com/rdf/rss-en-world'],
  ['Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml']
];

const decodeXml = value => value
  .split('<![CDATA[').join('').split(']]>').join('')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const tag = (xml, name) => {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, '').trim()) : '';
};
const fetchRssFallback = async () => {
  const responses = await Promise.allSettled(RSS_FEEDS.map(async ([domain, url]) => {
    const response = await fetch(url, { headers: { 'User-Agent': 'war-zone-dashboard/1.0' } });
    if (!response.ok) throw new Error(`${domain} RSS ${response.status}`);
    const xml = await response.text();
    return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, 5).map(item => {
      const entry = item[0];
      const title = tag(entry, 'title');
      const link = tag(entry, 'link') || (entry.match(/<link[^>]*href=["']([^"']+)/i) || [])[1] || '';
      return title && link ? { title, url: link, domain, seendate: tag(entry, 'pubDate') || new Date().toISOString() } : null;
    }).filter(Boolean);
  }));
  const articles = responses.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  return { articles: articles.slice(0, 12), source: 'rss' };
};

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const corsOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'GET') {
      return new Response('仅支持 GET 请求', { status: 405, headers: corsHeaders });
    }

    const target = new URL(GDELT_ENDPOINT);
    target.searchParams.set('query', '(war OR conflict OR missile OR airstrike)');
    target.searchParams.set('mode', 'artlist');
    target.searchParams.set('format', 'json');
    target.searchParams.set('maxrecords', '12');
    target.searchParams.set('sort', 'HybridRel');
    target.searchParams.set('timespan', '24h');

    const cache = caches.default;
    try {
      const response = await fetch(target, {
        headers: { 'User-Agent': 'war-zone-dashboard/1.0' },
        cf: { cacheTtl: 600, cacheEverything: true }
      });
      if (response.ok) {
        const cached = new Response(response.body, {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-News-Source': 'gdelt' }
        });
        ctx.waitUntil(cache.put(CACHE_KEY, cached.clone()));
        return cached;
      }
      if (response.status === 429) {
        const fallback = await fetchRssFallback();
        if (fallback.articles.length) {
          const payload = new Response(JSON.stringify(fallback), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-News-Source': 'rss-fallback' }
          });
          ctx.waitUntil(cache.put(CACHE_KEY, payload.clone()));
          return payload;
        }
        const cached = await cache.match(CACHE_KEY);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set('X-News-Source', 'cache-after-rate-limit');
          headers.set('X-News-Stale', 'true');
          return new Response(cached.body, { status: 200, headers });
        }
        return new Response(JSON.stringify({ error: '新闻源请求过于频繁', retryAfter: 60 }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' }
        });
      }
      return new Response(JSON.stringify({ error: `新闻源响应 ${response.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch {
      const cached = await cache.match(CACHE_KEY);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('X-News-Source', 'cache-after-error');
        headers.set('X-News-Stale', 'true');
        return new Response(cached.body, { status: 200, headers });
      }
      return new Response(JSON.stringify({ error: 'GDELT 新闻源暂时不可用' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
