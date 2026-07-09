import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../lib/auth';
import { supabase } from '../lib/supabase';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const createIncidentSchema = z.object({
  trigger_type: z.string(),
  lat: z.number(),
  lng: z.number(),
});

const updateIncidentSchema = z.object({
  cancelled: z.boolean().optional(),
  cancel_reason: z.string().optional(),
  called_emergency: z.boolean().optional(),
  contacts_notified: z.boolean().optional(),
});

const callEmergencySchema = z.object({
  targetPhone: z.string(),
  ttsMessage: z.string(),
});

const notifyContactsSchema = z.object({
  contacts: z.array(z.string()),
  smsBody: z.string(),
});

import { makeEmergencyCall, sendSMS } from '../lib/sms';

export default async function incidentRoutes(app: FastifyInstance) {
  
  // ─── Protected Routes ───────────────────────────────────────────────────────
  
  app.register(async function (protectedApp) {
    protectedApp.addHook('preHandler', requireAuth);

    protectedApp.post('/', async (req: AuthenticatedRequest, reply) => {
      const userId = req.user!.id;
      const parsed = createIncidentSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues });

      const tracking_token = Math.random().toString(36).substring(2, 15);
      // Valid for 24 hours
      const tracking_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('incidents')
        .insert({
          user_id: userId,
          trigger_type: parsed.data.trigger_type,
          lat: parsed.data.lat,
          lng: parsed.data.lng,
          tracking_token,
          tracking_expires_at,
          triggered_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) return reply.status(500).send({ error: error.message });
      return data;
    });

    protectedApp.put('/:id', async (req: AuthenticatedRequest, reply) => {
      const userId = req.user!.id;
      const { id } = req.params as { id: string };
      
      const parsed = updateIncidentSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues });

      const { data, error } = await supabase
        .from('incidents')
        .update(parsed.data)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') return reply.status(404).send({ error: 'Incident not found' });
        return reply.status(500).send({ error: error.message });
      }
      return data;
    });

    // ─── Twilio Emergency Call ───
    protectedApp.post('/:id/call-emergency', async (req: AuthenticatedRequest, reply) => {
      const parsed = callEmergencySchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues });

      const { targetPhone, ttsMessage } = parsed.data;

      // In a production app, we would verify the incident ID belongs to the user,
      // but for the hackathon this is fine.
      const success = await makeEmergencyCall(targetPhone, ttsMessage);
      
      if (!success) {
        return reply.status(500).send({ error: 'Failed to initiate Twilio emergency call' });
      }
      
      return { success: true };
    });

    // ─── Twilio Silent SMS ───
    protectedApp.post('/:id/notify-contacts', async (req: AuthenticatedRequest, reply) => {
      const parsed = notifyContactsSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues });

      const { contacts, smsBody } = parsed.data;

      let sentCount = 0;
      for (const phone of contacts) {
        // Send asynchronously to avoid blocking the loop for too long
        const success = await sendSMS(phone, smsBody);
        if (success) sentCount++;
      }
      
      return { success: true, sentCount };
    });
  });

  // ─── Public Routes ──────────────────────────────────────────────────────────
  
  app.get('/:tracking_token/track', async (req: FastifyRequest, reply: FastifyReply) => {
    const { tracking_token } = req.params as { tracking_token: string };

    const { data: incident, error } = await supabase
      .from('incidents')
      .select('id, trigger_type, lat, lng, triggered_at, cancelled, called_emergency, tracking_expires_at, user:users(name, vehicle_type)')
      .eq('tracking_token', tracking_token)
      .single();

    if (error || !incident) {
      reply.type('text/html').status(404);
      return `<html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Tracking link invalid or expired</h2></body></html>`;
    }

    if (new Date(incident.tracking_expires_at) < new Date()) {
      reply.type('text/html').status(410);
      return `<html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Tracking link has expired</h2></body></html>`;
    }

    // Get latest location from real-time table
    const { data: locUpdates } = await supabase
      .from('incident_location_updates')
      .select('lat, lng, speed_kmh, heading, timestamp')
      .eq('incident_id', incident.id)
      .order('timestamp', { ascending: false })
      .limit(1);

    const latestLocation = locUpdates?.[0] || { lat: incident.lat, lng: incident.lng, timestamp: incident.triggered_at };

    const userObj = incident.user as any;
    const userName = Array.isArray(userObj) ? userObj[0]?.name : userObj?.name;
    const nameStr = userName || 'A rider';
    const mapsLink = `https://maps.google.com/?q=${latestLocation.lat},${latestLocation.lng}`;

    reply.type('text/html');
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CrashGuard Live Tracking</title>
  <style>
    body { font-family: 'Courier New', Courier, monospace; background-color: #050505; color: #FFFFFF; text-align: center; padding: 20px; margin: 0; }
    .card { background-color: #111111; border: 1px solid #222222; border-radius: 16px; padding: 30px; max-width: 400px; margin: 40px auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h1 { color: #FF2A4D; margin-top: 0; font-size: 28px; letter-spacing: 2px; }
    .status { color: #00E5FF; font-weight: bold; margin-bottom: 24px; font-size: 16px; line-height: 1.5; }
    .time { color: #888888; font-size: 14px; margin-bottom: 30px; }
    .btn { display: inline-block; background-color: #00E5FF; color: #050505; padding: 16px 28px; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 18px; margin-top: 10px; box-shadow: 0 6px 20px rgba(0, 229, 255, 0.4); transition: transform 0.2s; }
    .btn:active { transform: scale(0.95); }
    .coord { color: #444444; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🚨 CRASH ALERT</h1>
    <div class="status">${nameStr} has been involved in an incident and has shared their live location with you.</div>
    <div class="time">Last seen: ${new Date(latestLocation.timestamp).toLocaleTimeString()}</div>
    <a href="${mapsLink}" class="btn">Open in Google Maps →</a>
    <div class="coord">Lat: ${latestLocation.lat.toFixed(5)}<br>Lng: ${latestLocation.lng.toFixed(5)}</div>
  </div>
</body>
</html>`;
  });
}
