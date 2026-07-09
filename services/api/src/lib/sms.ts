import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

let client: twilio.Twilio | null = null;
if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
} else {
  console.warn('⚠️ Twilio credentials missing. SMS will be mocked.');
}

/**
 * Sends an SMS message to a specific phone number.
 */
export async function sendSMS(to: string, body: string): Promise<boolean> {
  try {
    if (!client || !fromPhone) {
      console.log(`[MOCK SMS] To: ${to}\nBody: ${body}`);
      return true;
    }

    const message = await client.messages.create({
      body,
      from: fromPhone,
      to,
    });
    console.log(`[SMS] Sent to ${to}. SID: ${message.sid}`);
    return true;
  } catch (err) {
    console.error(`[SMS Error] Failed to send SMS to ${to}:`, err);
    return false;
  }
}

/**
 * Places an automated voice call using Twilio Programmable Voice, reading a TTS message.
 */
export async function makeEmergencyCall(to: string, ttsMessage: string): Promise<boolean> {
  try {
    if (!client || !fromPhone) {
      console.log(`[MOCK VOICE CALL] To: ${to}\nMessage: ${ttsMessage}`);
      return true;
    }

    // XML-escape the TTS message to avoid TwiML parse errors
    const escaped = ttsMessage
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    const twiml = `<Response><Say voice="alice">${escaped}</Say></Response>`;

    console.log(`[VOICE CALL] Initiating call to ${to} from ${fromPhone}...`);
    const call = await client.calls.create({
      twiml,
      to,
      from: fromPhone,
    });

    console.log(`[VOICE CALL] Initiated to ${to}. SID: ${call.sid}`);
    return true;
  } catch (err: any) {
    console.error(`[VOICE CALL Error] Failed to call ${to}:`, err?.message || err);
    return false;
  }
}
