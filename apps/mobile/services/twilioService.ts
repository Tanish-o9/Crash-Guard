/**
 * Direct Twilio Service — calls Twilio REST API directly from the phone.
 * 
 * This bypasses the backend API entirely, eliminating all localhost/tunnel
 * issues. The phone talks directly to api.twilio.com over HTTPS.
 * 
 * NOTE: In production, Twilio credentials should NEVER be in a client app.
 * This is acceptable for a hackathon demo only.
 */

const TWILIO_ACCOUNT_SID = process.env.EXPO_PUBLIC_TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.EXPO_PUBLIC_TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM_PHONE = process.env.EXPO_PUBLIC_TWILIO_PHONE_NUMBER || '';

const TWILIO_API_BASE = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}`;

/** Base64 encode for Basic Auth */
function btoa(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  for (let i = 0; i < str.length; i += 3) {
    const a = str.charCodeAt(i);
    const b = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
    const c = i + 2 < str.length ? str.charCodeAt(i + 2) : 0;
    output += chars.charAt(a >> 2);
    output += chars.charAt(((a & 3) << 4) | (b >> 4));
    output += i + 1 < str.length ? chars.charAt(((b & 15) << 2) | (c >> 6)) : '=';
    output += i + 2 < str.length ? chars.charAt(c & 63) : '=';
  }
  return output;
}

const AUTH_HEADER = `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`;

/** XML-escape text for TwiML */
function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Emergency Call Message Builder ───────────────────────────────────────────

export interface EmergencyCallParams {
  userName: string;
  lat: number;
  lng: number;
  bloodGroup?: string;
  vehicleType?: string;
  contactName: string;
}

/**
 * Build TwiML for an emergency call.
 * Speaks the message in English first, then repeats in Hindi.
 */
function buildEmergencyTwiml(params: EmergencyCallParams): string {
  const { userName, lat, lng, bloodGroup, vehicleType, contactName } = params;
  const mapsUrl = `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`;
  const latStr = lat.toFixed(4);
  const lngStr = lng.toFixed(4);
  const blood = bloodGroup || 'unknown';
  const vehicle = vehicleType || 'motorcycle';

  // English message
  const englishMsg = xmlEscape(
    `This is an emergency alert from CrashGuard. ` +
    `${userName} has been in a ${vehicle} accident and needs immediate help. ` +
    `Their location is latitude ${latStr}, longitude ${lngStr}. ` +
    `Blood group is ${blood}. ` +
    `Please check the SMS sent to your phone for the exact Google Maps location link. ` +
    `This is an automated emergency call. Please respond immediately.`
  );

  // Hindi message
  const hindiMsg = xmlEscape(
    `Yeh CrashGuard ki taraf se ek emergency alert hai. ` +
    `${userName} ka ${vehicle} accident hua hai aur unhe turant madad chahiye. ` +
    `Unka location latitude ${latStr}, longitude ${lngStr} hai. ` +
    `Blood group ${blood} hai. ` +
    `Kripya apne phone par aaye SMS mein Google Maps ka link dekhein. ` +
    `Yeh ek automated emergency call hai. Kripya turant madad karein.`
  );

  return (
    `<Response>` +
      `<Say voice="alice" language="en-IN">${englishMsg}</Say>` +
      `<Pause length="2"/>` +
      `<Say voice="alice" language="hi-IN">${hindiMsg}</Say>` +
    `</Response>`
  );
}

/**
 * Place an automated voice call via Twilio.
 * AI voice speaks the emergency message in English and Hindi.
 */
export async function twilioCall(
  to: string,
  params: EmergencyCallParams,
): Promise<{ ok: boolean; error?: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_PHONE) {
    return { ok: false, error: 'Twilio credentials not configured in .env' };
  }

  const twiml = buildEmergencyTwiml(params);

  const body = new URLSearchParams({
    To: to,
    From: TWILIO_FROM_PHONE,
    Twiml: twiml,
  });

  try {
    console.log(`[TWILIO CALL] Initiating call to ${to}...`);
    console.log(`[TWILIO CALL] From: ${TWILIO_FROM_PHONE}`);
    console.log(`[TWILIO CALL] TwiML length: ${twiml.length}`);

    const res = await fetch(`${TWILIO_API_BASE}/Calls.json`, {
      method: 'POST',
      headers: {
        'Authorization': AUTH_HEADER,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const responseText = await res.text();
    console.log(`[TWILIO CALL] Response status: ${res.status}`);
    console.log(`[TWILIO CALL] Response: ${responseText.substring(0, 500)}`);

    if (res.ok) {
      const data = JSON.parse(responseText);
      console.log(`[TWILIO CALL] Success → ${to}, SID: ${data.sid}`);
      return { ok: true };
    } else {
      const errData = JSON.parse(responseText).catch?.(() => ({})) || JSON.parse(responseText);
      const msg = errData.message || `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
  } catch (e: any) {
    console.error(`[TWILIO CALL] Network error → ${to}:`, e.message);
    return { ok: false, error: e.message || 'Network error' };
  }
}

/**
 * Send an SMS via Twilio with the crash location.
 */
export async function twilioSms(to: string, messageBody: string): Promise<{ ok: boolean; error?: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_PHONE) {
    return { ok: false, error: 'Twilio credentials not configured in .env' };
  }

  const body = new URLSearchParams({
    To: to,
    From: TWILIO_FROM_PHONE,
    Body: messageBody,
  });

  try {
    console.log(`[TWILIO SMS] Sending SMS to ${to}...`);
    console.log(`[TWILIO SMS] From: ${TWILIO_FROM_PHONE}`);
    console.log(`[TWILIO SMS] Body length: ${messageBody.length}`);

    const res = await fetch(`${TWILIO_API_BASE}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': AUTH_HEADER,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const responseText = await res.text();
    console.log(`[TWILIO SMS] Response status: ${res.status}`);
    console.log(`[TWILIO SMS] Response: ${responseText.substring(0, 500)}`);

    if (res.ok) {
      const data = JSON.parse(responseText);
      console.log(`[TWILIO SMS] Success → ${to}, SID: ${data.sid}`);
      return { ok: true };
    } else {
      let msg = `HTTP ${res.status}`;
      try {
        const errData = JSON.parse(responseText);
        msg = errData.message || msg;
        // Show specific Twilio error code for debugging
        if (errData.code) msg = `[${errData.code}] ${msg}`;
      } catch {}
      console.error(`[TWILIO SMS] Failed → ${to}: ${msg}`);
      return { ok: false, error: msg };
    }
  } catch (e: any) {
    console.error(`[TWILIO SMS] Network error → ${to}:`, e.message);
    return { ok: false, error: e.message || 'Network error' };
  }
}
