import { FastifyInstance } from 'fastify';
import { z } from 'zod';

const hospitalQuerySchema = z.object({
  lat: z.string(),
  lng: z.string(),
});

export default async function hospitalRoutes(app: FastifyInstance) {
  app.get('/nearby', async (req, reply) => {
    const parsed = hospitalQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues });

    const { lat, lng } = parsed.data;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      // Mock data for hackathon if no API key
      return reply.send({
        results: [
          { name: 'City General Hospital', vicinity: '123 Main St', rating: 4.5, place_id: 'mock_1' },
          { name: 'Trauma Center West', vicinity: '456 West Blvd', rating: 4.8, place_id: 'mock_2' },
        ],
      });
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=10000&type=hospital&key=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();

      return reply.send({
        results: data.results.map((r: any) => ({
          name: r.name,
          vicinity: r.vicinity,
          rating: r.rating,
          place_id: r.place_id,
          geometry: r.geometry,
        })),
      });
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to fetch hospitals' });
    }
  });
}
