import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import userRoutes from './routes/users';
import incidentRoutes from './routes/incidents';
import samaritanRoutes from './routes/samaritan';
import hospitalRoutes from './routes/hospitals';

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  },
});

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? '0.0.0.0';

async function start() {
  try {
    // ─── Plugins ────────────────────────────────────────────────────────────────
    await app.register(helmet);
    await app.register(cors, {
      origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
      credentials: true,
    });
    await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

    // ─── Health ─────────────────────────────────────────────────────────────────
    app.get('/health', async (_request, reply) => {
      return reply.send({
        status: 'ok',
        service: 'crashguard-api',
        version: process.env.npm_package_version ?? '0.0.1',
        timestamp: new Date().toISOString(),
      });
    });

    // ─── Route modules ──────────────────────────────────────────────────────────
    app.register(userRoutes, { prefix: '/users' });
    app.register(incidentRoutes, { prefix: '/incidents' });
    app.register(samaritanRoutes, { prefix: '/samaritan' });
    app.register(hospitalRoutes, { prefix: '/hospitals' });

    await app.listen({ port: PORT, host: HOST });
    console.log(`🚀 CrashGuard API running at http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
