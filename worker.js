const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const ALLOWED_ORIGIN = 'https://fendou986-arch.github.io';

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const corsOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'public, max-age=300',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'GET') {
      return new Response('仅支持 GET 请求', { status: 405, headers: corsHeaders });
    }

    const target = new URL(GDELT_ENDPOINT);
    target.searchParams.set('query', 'war OR conflict OR missile OR airstrike');
    target.searchParams.set('mode', 'artlist');
    target.searchParams.set('format', 'json');
    target.searchParams.set('maxrecords', '12');
    target.searchParams.set('sort', 'HybridRel');
    target.searchParams.set('timespan', '24h');

    try {
      const response = await fetch(target, {
        headers: { 'User-Agent': 'war-zone-dashboard/1.0' },
        cf: { cacheTtl: 300, cacheEverything: true }
      });
      return new Response(response.body, {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch {
      return new Response(JSON.stringify({ error: 'GDELT 新闻源暂时不可用' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
