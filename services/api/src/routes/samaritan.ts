import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { sendSMS } from '../lib/sms';

const samaritanReportSchema = z.object({
  reporter_phone: z.string().optional(),
  reporter_name: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  nlp_intake: z.string().optional(),
  severity_estimate: z.enum(['low', 'medium', 'high', 'unknown']).optional(),
  can_transport: z.boolean().optional(),
  hospital_chosen: z.string().optional(),
  hospital_place_id: z.string().optional(),
});

export default async function samaritanRoutes(app: FastifyInstance) {
  app.post('/report', async (req, reply) => {
    const parsed = samaritanReportSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues });

    // Try to find a nearby active incident (within ~500 meters, last 30 minutes)
    // For hackathon simplicity, we might just associate with the latest incident in the area, or leave it null.
    // In a real scenario we'd do a geospatial PostGIS query.
    
    const { data, error } = await supabase
      .from('samaritan_events')
      .insert({
        ...parsed.data,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    // Optional: send SMS to the reporter confirming help is on the way if phone is provided
    if (parsed.data.reporter_phone) {
      void sendSMS(
        parsed.data.reporter_phone,
        'Thank you for reporting the incident. Emergency services have been notified.'
      );
    }

    return data;
  });
}
