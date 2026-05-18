export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    const rsvpList = await env.RSVPS.list({ prefix: 'rsvp:' });
    const avecList = await env.RSVPS.list({ prefix: 'avec:' });
    const totalGuests = rsvpList.keys.length + avecList.keys.length;
    
    let spotsLeft = 100 - totalGuests;
    if (spotsLeft < 0) spotsLeft = 0;
    
    return new Response(JSON.stringify({ spotsLeft, totalCapacity: 100 }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to fetch capacity' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
