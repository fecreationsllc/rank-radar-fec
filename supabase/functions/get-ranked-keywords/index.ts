import { corsHeaders } from '@supabase/supabase-js/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { domain, location_code } = await req.json()
    if (!domain || !location_code) {
      return new Response(JSON.stringify({ error: 'domain and location_code required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const login = Deno.env.get('DATAFORSEO_LOGIN')!
    const password = Deno.env.get('DATAFORSEO_PASSWORD')!
    const auth = btoa(`${login}:${password}`)

    const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        target: domain,
        location_code,
        language_code: 'en',
        limit: 100,
        filters: ['ranked_serp_element.serp_item.rank_absolute', '<=', 100],
      }]),
    })

    const json = await res.json()
    const items = json?.tasks?.[0]?.result?.[0]?.items ?? []

    const keywords = items
      .map((item: any) => ({
        keyword: item.keyword_data?.keyword ?? '',
        position: item.ranked_serp_element?.serp_item?.rank_absolute ?? null,
        volume: item.keyword_data?.keyword_info?.search_volume ?? 0,
      }))
      .filter((k: any) => k.keyword)
      .sort((a: any, b: any) => (b.volume ?? 0) - (a.volume ?? 0))

    return new Response(JSON.stringify({ keywords }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
