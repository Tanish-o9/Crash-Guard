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
