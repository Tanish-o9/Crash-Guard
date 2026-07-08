import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../lib/auth';
import { supabase } from '../lib/supabase';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const profileUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  blood_group: z.string().optional(),
  vehicle_type: z.string().optional(),
  mount_position: z.string().optional(),
});

const emergencyContactSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  priority_order: z.number().int().min(1),
});

const baselineSchema = z.object({
  feature_means: z.record(z.number()),
  feature_stds: z.record(z.number()),
  sample_count: z.number().int().min(1),
});

export default async function userRoutes(app: FastifyInstance) {
  // All user routes require authentication
  app.addHook('preHandler', requireAuth);

  // ─── Profile ────────────────────────────────────────────────────────────────

  app.get('/me', async (req: AuthenticatedRequest, reply) => {
    const userId = req.user!.id;
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return reply.status(404).send({ error: 'User profile not found' });
      return reply.status(500).send({ error: error.message });
    }
    return data;
  });

  app.put('/me/profile', async (req: AuthenticatedRequest, reply) => {
    const userId = req.user!.id;
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues });

    const { data, error } = await supabase
      .from('users')
      .update(parsed.data)
      .eq('id', userId)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return data;
  });

  // ─── Emergency Contacts ──────────────────────────────────────────────────────

  app.get('/me/emergency-contacts', async (req: AuthenticatedRequest, reply) => {
    const userId = req.user!.id;
    const { data, error } = await supabase
      .from('emergency_contacts')
      .select('*')
      .eq('user_id', userId)
      .order('priority_order', { ascending: true });

    if (error) return reply.status(500).send({ error: error.message });
    return data;
  });

  app.post('/me/emergency-contacts', async (req: AuthenticatedRequest, reply) => {
    const userId = req.user!.id;
    
    // Accept either a single contact or an array of contacts
    const body = Array.isArray(req.body) ? req.body : [req.body];
    const parsed = z.array(emergencyContactSchema).safeParse(body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues });

    // For simplicity, overwrite existing contacts or append. Here we delete old and insert new.
    await supabase.from('emergency_contacts').delete().eq('user_id', userId);

    const inserts = parsed.data.map((c) => ({ ...c, user_id: userId }));
    const { data, error } = await supabase
      .from('emergency_contacts')
      .insert(inserts)
      .select();

    if (error) return reply.status(500).send({ error: error.message });
    return data;
  });

  // ─── Sensor Baseline ────────────────────────────────────────────────────────

  app.get('/me/baseline', async (req: AuthenticatedRequest, reply) => {
    const userId = req.user!.id;
    const { data, error } = await supabase
      .from('user_baselines')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return reply.status(404).send({ error: 'Baseline not found' });
      return reply.status(500).send({ error: error.message });
    }
    return data;
  });

  app.post('/me/baseline', async (req: AuthenticatedRequest, reply) => {
    const userId = req.user!.id;
    const parsed = baselineSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues });

    const payload = {
      user_id: userId,
      feature_means: parsed.data.feature_means,
      feature_stds: parsed.data.feature_stds,
      sample_count: parsed.data.sample_count,
    };

    const { data, error } = await supabase
      .from('user_baselines')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return data;
  });
}
