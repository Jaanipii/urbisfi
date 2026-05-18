export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const name = formData.get('name')?.trim();
    const email = formData.get('email')?.trim();
    const marketingOptIn = formData.get('consent_marketing') === 'true';
    const rsvpType = formData.get('rsvp_type') === 'priority' ? 'priority' : 'primary';
    const honey = formData.get('_honey');

    // Honeypot check
    if (honey) {
      const origin = new URL(request.url).origin;
      return Response.redirect(`${origin}/rsvp/success.html`, 302);
    }

    // Validation
    if (!name || !email) {
      return new Response('Name and email are required', { status: 400 });
    }

    // Rate Limiting
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (ip !== 'unknown') {
      const rlKey = `rl:${ip}`;
      const rlData = await env.RSVPS.get(rlKey, 'json') || { count: 0, time: Date.now() };
      
      if (Date.now() - rlData.time > 60000) {
        rlData.count = 1;
        rlData.time = Date.now();
      } else {
        rlData.count += 1;
      }
      
      if (rlData.count > 4) {
        return new Response('Too many requests, please try again later.', { status: 429 });
      }
      await env.RSVPS.put(rlKey, JSON.stringify(rlData), { expirationTtl: 60 });
    }

    const safeEmail = email.toLowerCase();
    const rsvpKey = `rsvp:${safeEmail}`;

    // Check capacity
    const rsvpList = await env.RSVPS.list({ prefix: 'rsvp:' });
    const avecList = await env.RSVPS.list({ prefix: 'avec:' });
    const totalGuests = rsvpList.keys.length + avecList.keys.length;

    if (totalGuests >= 100) {
      const origin = new URL(request.url).origin;
      return Response.redirect(`${origin}/rsvp/full.html`, 302);
    }

    // Check for duplicate email
    const isDuplicate = await env.RSVPS.get(rsvpKey);

    if (!isDuplicate) {
      const metadata = {
        name,
        email: safeEmail,
        timestamp: new Date().toISOString(),
        marketingOptIn,
        type: rsvpType
      };

      await env.RSVPS.put(rsvpKey, '1', { metadata });

      // Send confirmation email (fire-and-forget)
      if (env.RESEND_API_KEY) {
        try {
          const firstName = name.split(' ')[0];
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.RESEND_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'Urban Garden <rsvp@urbangardenhelsinki.fi>',
              to: email,
              subject: "You're in — Urban Garden Soft Launch",
              html: buildConfirmationEmail(firstName)
            })
          });
        } catch (_) {
          // Email failure shouldn't block RSVP
        }
      }
    }

    // Redirect to success page
    const origin = new URL(request.url).origin;
    return Response.redirect(`${origin}/rsvp/success.html`, 302);

  } catch (err) {
    return new Response('Something went wrong', { status: 500 });
  }
}

// GET — Admin dashboard or CSV download
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const format = url.searchParams.get('format');

  if (key !== 'Urbis29.5') {
    return new Response('Unauthorized', { status: 401 });
  }

  const rsvpList = await env.RSVPS.list({ prefix: 'rsvp:' });
  const avecList = await env.RSVPS.list({ prefix: 'avec:' });
  
  const allKeys = [...rsvpList.keys, ...avecList.keys];
  const rsvps = allKeys
    .map(k => k.metadata || {})
    .filter(r => r.email) // ensure valid metadata
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // CSV download
  if (format === 'csv') {
    const header = 'Name,Email,Guest Type,Timestamp,Marketing Opt-In';
    const rows = rsvps.map(r => {
      let typeLabel = 'Primary';
      if (r.type === 'avec') typeLabel = '+1 for ' + r.invitee;
      else if (r.type === 'priority') typeLabel = 'Priority';
      return `"${r.name.replace(/"/g, '""')}","${r.email}","${typeLabel}","${r.timestamp}","${r.marketingOptIn ? 'Yes' : 'No'}"`;
    });
    const csv = [header, ...rows].join('\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="urban-garden-rsvps-${new Date().toISOString().slice(0,10)}.csv"`,
        'Cache-Control': 'no-cache'
      }
    });
  }

  // JSON download
  if (format === 'json') {
    return new Response(JSON.stringify(rsvps, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="urban-garden-rsvps-${new Date().toISOString().slice(0,10)}.json"`,
        'Cache-Control': 'no-cache'
      }
    });
  }

  // HTML dashboard
  const tableRows = rsvps.map((r, i) => {
    const date = new Date(r.timestamp);
    const formatted = date.toLocaleDateString('fi-FI', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    
    let typeHtml = 'Primary';
    if (r.type === 'avec') {
      typeHtml = `<span style="color:var(--text-sec);">+1</span> (${escapeHtml(r.invitee)})`;
    } else if (r.type === 'priority') {
      typeHtml = `<span style="color:var(--green); font-weight: 500;">Priority</span>`;
    }

    return `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(r.name)}</td>
        <td><a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a></td>
        <td class="dim">${typeHtml}</td>
        <td class="dim">${formatted}</td>
        <td class="dim" style="color: ${r.marketingOptIn ? 'var(--green)' : 'inherit'};">${r.marketingOptIn ? 'Opted In' : '—'}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RSVPs — Urban Garden Admin</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #0e0e0e; --bg-card: #161616; --bg-row: #1a1a1a;
      --text: #f0ece4; --text-sec: #9a958c; --text-dim: #5a564f;
      --green: #5cb832; --green-light: #7ed957;
      --border: rgba(255,255,255,0.06);
      --font: 'DM Sans', -apple-system, sans-serif;
    }
    body {
      font-family: var(--font); background: var(--bg); color: var(--text);
      min-height: 100vh; -webkit-font-smoothing: antialiased;
    }
    .page {
      max-width: 900px; margin: 0 auto; padding: 48px 24px 80px;
    }
    .header {
      display: flex; align-items: flex-end; justify-content: space-between;
      margin-bottom: 40px; flex-wrap: wrap; gap: 20px;
    }
    .header-left {}
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 0.6rem; font-weight: 500; letter-spacing: 0.2em;
      text-transform: uppercase; color: var(--green);
      background: rgba(92,184,50,0.08); border: 1px solid rgba(92,184,50,0.15);
      padding: 4px 12px; border-radius: 20px; margin-bottom: 16px;
    }
    .badge-dot {
      width: 5px; height: 5px; background: var(--green);
      border-radius: 50%; animation: pulse 2s infinite;
    }
    h1 {
      font-size: 1.6rem; font-weight: 300; letter-spacing: 0.02em;
      color: var(--text);
    }
    h1 span { color: var(--text-dim); font-weight: 300; }
    .actions { display: flex; gap: 10px; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 20px; border-radius: 8px; font-family: var(--font);
      font-size: 0.75rem; font-weight: 500; letter-spacing: 0.08em;
      text-transform: uppercase; text-decoration: none;
      border: 1px solid var(--border); background: rgba(255,255,255,0.03);
      color: var(--text-sec); cursor: pointer; transition: all 0.3s ease;
    }
    .btn:hover { border-color: rgba(255,255,255,0.15); color: var(--text); }
    .btn-primary {
      background: rgba(92,184,50,0.1); border-color: rgba(92,184,50,0.2);
      color: var(--green);
    }
    .btn-primary:hover {
      background: rgba(92,184,50,0.15); border-color: rgba(92,184,50,0.3);
      color: var(--green-light);
    }
    .btn svg { width: 14px; height: 14px; }

    /* Stats */
    .stats {
      display: flex; gap: 32px; margin-bottom: 32px;
    }
    .stat {
      display: flex; flex-direction: column; gap: 2px;
    }
    .stat-value {
      font-size: 2rem; font-weight: 600; color: var(--text); line-height: 1;
    }
    .stat-label {
      font-size: 0.65rem; font-weight: 400; letter-spacing: 0.2em;
      text-transform: uppercase; color: var(--text-dim);
    }

    /* Table */
    .table-wrap {
      border: 1px solid var(--border); border-radius: 12px;
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left; padding: 14px 20px;
      font-size: 0.6rem; font-weight: 500; letter-spacing: 0.2em;
      text-transform: uppercase; color: var(--text-dim);
      background: var(--bg-card); border-bottom: 1px solid var(--border);
    }
    td {
      padding: 14px 20px; font-size: 0.85rem; font-weight: 400;
      color: var(--text-sec); border-bottom: 1px solid var(--border);
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255,255,255,0.015); }
    td.num { color: var(--text-dim); font-size: 0.75rem; width: 50px; }
    td.dim { color: var(--text-dim); font-size: 0.8rem; }
    td a { color: var(--green); text-decoration: none; }
    td a:hover { text-decoration: underline; }

    .empty {
      text-align: center; padding: 60px 20px;
      color: var(--text-dim); font-size: 0.9rem; font-weight: 300;
    }

    .footer {
      margin-top: 32px; text-align: center;
    }
    .footer a {
      font-size: 0.7rem; color: var(--text-dim); text-decoration: none;
      letter-spacing: 0.05em; transition: color 0.3s;
    }
    .footer a:hover { color: var(--green); }

    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(92,184,50,0.7); }
      70% { box-shadow: 0 0 0 5px rgba(92,184,50,0); }
      100% { box-shadow: 0 0 0 0 rgba(92,184,50,0); }
    }

    @media (max-width: 600px) {
      .header { flex-direction: column; align-items: flex-start; }
      .stats { gap: 24px; }
      th, td { padding: 12px 14px; }
      td.dim { display: none; }
      th:last-child { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-left">
        <div class="badge"><span class="badge-dot"></span> Admin</div>
        <h1>RSVPs <span>— Soft Launch</span></h1>
      </div>
      <div class="actions">
        <a href="?key=Urbis29.5&format=csv" class="btn btn-primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Download CSV
        </a>
        <a href="?key=Urbis29.5&format=json" class="btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          JSON
        </a>
      </div>
    </div>

    <div class="stats">
      <div class="stat">
        <span class="stat-value">${rsvps.length}</span>
        <span class="stat-label">Total RSVPs</span>
      </div>
    </div>

    <div class="table-wrap">
      ${rsvps.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Email</th>
            <th>Guest Type</th>
            <th>Date</th>
            <th>Marketing</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      ` : `<div class="empty">No RSVPs yet</div>`}
    </div>

    <div class="footer">
      <a href="/rsvp/">← Back to RSVP form</a>
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache'
    }
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildConfirmationEmail(firstName) {
  const bannerUrl = 'https://urbangardenhelsinki.fi/rsvpbanner.png';
  const mapsUrl = 'https://maps.google.com/?q=Kansakoulukatu+3,+Helsinki';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>RSVP Confirmed</title>
  <style>
    body { margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
    img { border:0; display:block; outline:none; }
    a { color:#5cb832; }
    @media only screen and (max-width:520px) {
      .outer { width:100%!important; }
      .pad { padding:28px 20px!important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;">

<div style="display:none;max-height:0;overflow:hidden;">Your RSVP is confirmed for the Urban Garden Soft Launch — 21.05.2026</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" style="padding:0;">
<table role="presentation" class="outer" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

<!-- Banner Image -->
<tr>
<td style="padding:0;">
<img src="${bannerUrl}" alt="Urban Garden — RSVP Soft Launch" width="600" style="width:100%;height:auto;display:block;" />
</td>
</tr>

<!-- Content -->
<tr>
<td class="pad" style="padding:36px 40px 32px;">

<div style="font-size:16px;color:#222;line-height:1.7;margin-bottom:16px;">
Hey ${firstName},
</div>

<div style="font-size:15px;color:#555;line-height:1.7;margin-bottom:28px;">
Your RSVP for the <strong style="color:#222;">Urban Garden Soft Launch</strong> is confirmed. You're on the guest list.<br><br>
16:00 &ndash; 20:00<br><br>
DJ by Luxonia playing house music.<br>
The on-site jacuzzi and sauna will be available. Kindly bring your own swimwear and towel.<br>
Bar open until 19:30.
</div>

<!-- Event Details -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:10px;border:1px solid #ddd;">
<tr>
<td style="padding:24px;">

<div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#5cb832;font-weight:600;">Date</div>
<div style="font-size:15px;color:#222;margin-top:4px;margin-bottom:18px;">Thursday, 21 May 2026</div>

<div style="height:1px;background-color:#ddd;margin-bottom:18px;"></div>

<div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#5cb832;font-weight:600;">Location</div>
<div style="margin-top:4px;margin-bottom:18px;"><a href="${mapsUrl}" target="_blank" style="font-size:15px;color:#222;text-decoration:none;">Kansakoulukatu 3, Helsinki &#8599;</a></div>

<div style="height:1px;background-color:#ddd;margin-bottom:18px;"></div>

<div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#5cb832;font-weight:600;">Event</div>
<div style="font-size:15px;color:#222;margin-top:4px;">Soft Launch &mdash; Invite Only</div>

</td>
</tr>
</table>

<div style="margin-top:24px;font-size:13px;color:#888;line-height:1.7;">
We'll send more details closer to the event. Keep this email as your confirmation.
</div>

<!-- CTAs -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
<tr>
<td align="center" style="padding-bottom:12px;">
<a href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=Urban+Garden+Soft+Launch&dates=20260521T130000Z/20260521T170000Z&details=DJ+by+Luxonia+playing+house+music.%0AThe+on-site+jacuzzi+and+sauna+will+be+available.+Kindly+bring+your+own+swimwear+and+towel.%0ABar+open+until+19%3A30.&location=Kansakoulukatu+3,+Helsinki" target="_blank" style="display:inline-block;padding:14px 36px;background-color:#5cb832;border-radius:40px;color:#ffffff;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;">Add to Calendar</a>
</td>
</tr>
<tr>
<td align="center" style="padding-bottom:12px;">
<a href="https://urbangardenhelsinki.fi/rsvp/avec.html" target="_blank" style="display:inline-block;padding:14px 36px;background-color:transparent;border:1px solid #5cb832;border-radius:40px;color:#5cb832;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;">Register your +1</a>
</td>
</tr>
<tr>
<td align="center">
<a href="https://urbangardenhelsinki.fi" target="_blank" style="display:inline-block;padding:14px 36px;border:1px solid #5cb832;border-radius:40px;color:#5cb832;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;">Urban Garden &rarr;</a>
</td>
</tr>
</table>

</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding:24px 40px;">
<div style="font-size:11px;color:#aaa;line-height:1.8;text-align:center;">
Urban Garden Helsinki &middot; Kansakoulukatu 3<br>
You received this because you RSVP'd for the soft launch.
</div>
</td>
</tr>

</table>
</td>
</tr>
</table>

</body>
</html>`;
}
  const bannerUrl = 'https://urbangardenhelsinki.fi/rsvpbanner.png';
