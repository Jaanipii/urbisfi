export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const name = formData.get('name')?.trim();
    const email = formData.get('email')?.trim();
    const inviteeEmail = formData.get('invitee_email')?.trim();
    const marketingOptIn = formData.get('consent_marketing') === 'true';
    const honey = formData.get('_honey');

    // Honeypot check
    if (honey) {
      const origin = new URL(request.url).origin;
      return Response.redirect(`${origin}/rsvp/success.html`, 302);
    }

    // Validation
    if (!name || !email || !inviteeEmail) {
      return new Response('Name, your email, and invitee email are required', { status: 400 });
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
    const safeInvitee = inviteeEmail.toLowerCase();
    
    // Check if invitee exists
    const inviteeKey = `rsvp:${safeInvitee}`;
    const inviteeExists = await env.RSVPS.get(inviteeKey);
    if (!inviteeExists) {
      return new Response('The invitee email provided is not on the guest list. Only confirmed guests can bring a +1.', { status: 400 });
    }

    // Check if invitee already has a +1
    const avecKey = `avec:${safeInvitee}`;
    const avecExists = await env.RSVPS.get(avecKey);
    if (avecExists) {
      return new Response('This invitee has already registered a +1.', { status: 400 });
    }

    // Check capacity (RSVPs + Avecs)
    const rsvpList = await env.RSVPS.list({ prefix: 'rsvp:' });
    const avecList = await env.RSVPS.list({ prefix: 'avec:' });
    const totalGuests = rsvpList.keys.length + avecList.keys.length;

    if (totalGuests >= 100) {
      const origin = new URL(request.url).origin;
      return Response.redirect(`${origin}/rsvp/full.html`, 302);
    }

    // Save Avec
    const metadata = {
      name,
      email: safeEmail,
      invitee: safeInvitee,
      timestamp: new Date().toISOString(),
      marketingOptIn,
      type: 'avec'
    };

    await env.RSVPS.put(avecKey, '1', { metadata });

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
            to: safeEmail,
            subject: "You're in — Urban Garden Soft Launch",
            html: buildConfirmationEmail(firstName)
          })
        });
      } catch (_) {
        // Email failure shouldn't block
      }
    }

    // Redirect to success page
    const origin = new URL(request.url).origin;
    return Response.redirect(`${origin}/rsvp/success.html`, 302);

  } catch (err) {
    return new Response('Something went wrong', { status: 500 });
  }
}

function buildConfirmationEmail(firstName) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Urban Garden RSVP</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#0e0e0e;color:#f0ece4;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0e0e0e;">
<tr>
<td align="center" style="padding:40px 20px;">
<table role="presentation" width="100%" max-width="500" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background-color:#141414;border:1px solid #222222;border-radius:12px;overflow:hidden;">

<!-- Header Image -->
<tr>
<td style="background-color:#000000;text-align:center;">
<img src="https://urbangardenhelsinki.fi/rsvpbanner.png" alt="Urban Garden" width="500" style="width:100%;max-width:500px;height:auto;display:block;border:none;">
</td>
</tr>

<!-- Content -->
<tr>
<td style="padding:40px 32px;">
<h1 style="margin:0 0 24px 0;font-size:24px;font-weight:300;letter-spacing:1px;color:#ffffff;text-transform:uppercase;">You're in, ${firstName}.</h1>

<div style="font-size:15px;line-height:1.6;color:#a0a0a0;margin-bottom:32px;">
Your RSVP for the <strong style="color:#ffffff;">Urban Garden Soft Launch</strong> is confirmed. You're on the guest list as a +1.<br><br>
16:00 &ndash; 20:00<br><br>
DJ by Luxonia playing house music.<br>
The on-site jacuzzi and sauna will be available. Kindly bring your own swimwear and towel.<br>
Bar open until 19:30.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
<tr>
<td align="center" style="padding-bottom:12px;">
<a href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=Urban+Garden+Soft+Launch&dates=20260521T130000Z/20260521T170000Z&details=DJ+by+Luxonia+playing+house+music.%0AThe+on-site+jacuzzi+and+sauna+will+be+available.+Kindly+bring+your+own+swimwear+and+towel.%0ABar+open+until+19%3A30.&location=Kansakoulukatu+3,+Helsinki" target="_blank" style="display:inline-block;padding:14px 36px;background-color:#5cb832;border-radius:40px;color:#ffffff;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;">Add to Calendar</a>
</td>
</tr>
<tr>
<td align="center">
<a href="https://urbangardenhelsinki.fi" style="display:inline-block;padding:14px 36px;background-color:transparent;border:1px solid #333;border-radius:40px;color:#ffffff;text-decoration:none;font-size:11px;font-weight:400;letter-spacing:2px;text-transform:uppercase;">Urban Garden &rarr;</a>
</td>
</tr>
</table>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding:24px;background-color:#0a0a0a;border-top:1px solid #222222;text-align:center;">
<p style="margin:0;font-size:11px;color:#666666;letter-spacing:0.5px;">
Kansakoulukatu 3, Helsinki<br><br>
&copy; 2026 Urban Garden
</p>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;
}
