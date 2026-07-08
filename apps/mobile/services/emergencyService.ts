/**
 * Emergency Service — handles orchestration of calling and SMS notifications.
 *
 * For the hackathon (Phase 0):
 * - Calls are routed to the mock emergency number via Linking.
 * - SMS notifications are simulated (logged locally) or use a basic Supabase Edge Function 
 *   if configured.
 */
import { supabase } from '@/lib/supabase';
import type { SamaritanReport, Hospital } from '@crashguard/types';

export const emergencyService = {
  /**
   * Logs a Good Samaritan report to the database and "sends" SMS to contacts.
   */
  async submitSamaritanReport(report: Partial<SamaritanReport>): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('samaritan_events')
        .insert([{
          lat: report.lat,
          lng: report.lng,
          nlp_intake: report.nlpIntake,
          severity_estimate: report.severityEstimate,
          can_transport: report.canTransport,
          hospital_chosen: report.hospitalChosen,
        }])
        .select('id')
        .single();

      if (error) {
        console.error('Failed to log samaritan event:', error);
        return null;
      }

      // Simulate sending SMS cascade to the rider's contacts
      // In a real app, the backend would look up the closest matching active incident
      // or broadcast to nearby users' contacts.
      console.log(`[EmergencyService] 📱 SMS dispatched for Samaritan Report: ${data.id}`);
      
      return data.id;
    } catch (err) {
      console.error(err);
      return null;
    }
  },

  /**
   * Fetches nearby hospitals from our API.
   */
  async getNearbyHospitals(lat: number, lng: number): Promise<Hospital[]> {
    try {
      const url = `${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000'}/hospitals/nearby?lat=${lat}&lng=${lng}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch hospitals');
      }

      const data = await response.json();
      
      // Map API response to our Hospital type
      return (data.results || []).map((h: any, index: number) => ({
        placeId: h.place_id,
        name: h.name,
        address: h.vicinity,
        lat: h.geometry?.location?.lat ?? lat,
        lng: h.geometry?.location?.lng ?? lng,
        distanceKm: Math.random() * 5 + 1, // Mock distance if not returned by API
        rating: h.rating,
      }));
    } catch (err) {
      console.error('Error fetching hospitals:', err);
      return [];
    }
  }
};
