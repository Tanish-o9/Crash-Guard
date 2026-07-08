import { FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from './supabase';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    email?: string;
    phone?: string;
  };
}

/**
 * Fastify preHandler hook to verify the Supabase JWT token from the Authorization header.
 */
export async function requireAuth(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.substring(7);

  // Validate the JWT via Supabase Auth
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return reply.status(401).send({ error: 'Unauthorized: Invalid token' });
  }

  request.user = {
    id: user.id,
    email: user.email,
    phone: user.phone,
  };
}
