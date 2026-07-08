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
      return reply.status(404).send({ error: 'Tracking link invalid or expired' });
    }

    if (new Date(incident.tracking_expires_at) < new Date()) {
      return reply.status(410).send({ error: 'Tracking link has expired' });
    }

    // Get latest location from real-time table
    const { data: locUpdates } = await supabase
      .from('incident_location_updates')
      .select('lat, lng, speed_kmh, heading, timestamp')
      .eq('incident_id', incident.id)
      .order('timestamp', { ascending: false })
      .limit(1);

    const latestLocation = locUpdates?.[0] || { lat: incident.lat, lng: incident.lng, timestamp: incident.triggered_at };

    return {
      incident,
      latestLocation,
    };
  });
}
