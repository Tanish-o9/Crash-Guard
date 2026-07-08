/**
 * useEmergencyOrchestrator — React hook that kicks off the emergency engine
 * when the calling screen mounts.
 *
 * - Reads the incidentId from alarmStore (set when alarm escalated)
 * - Calls emergencyOrchestrator.run(incidentId) exactly once
 * - Exposes the full orchestrator state to the calling screen
 * - Cleans up on unmount
 */
import { useEffect, useRef } from 'react';
import { useAlarmStore } from '@/store/alarmStore';
import { useEmergencyOrchestratorStore } from '@/store/emergencyOrchestratorStore';
import { emergencyOrchestrator } from '@/services/emergencyOrchestrator';

export function useEmergencyOrchestrator() {
  const hasStarted = useRef(false);
  const { incidentId: alarmIncidentId } = useAlarmStore();
  const store = useEmergencyOrchestratorStore();

  useEffect(() => {
    if (hasStarted.current) return;
    if (!alarmIncidentId) return;

    hasStarted.current = true;
    store.reset();

    emergencyOrchestrator.run(alarmIncidentId).catch((err) => {
      console.error('[EmergencyOrchestrator] Fatal error:', err);
    });

    return () => {
      emergencyOrchestrator.stop();
    };
  }, [alarmIncidentId]);

  return {
    machineState: store.machineState,
    incidentId: store.incidentId,
    trackingLink: store.trackingLink,
    ttsMessage: store.ttsMessage,
    ttsLanguage: store.ttsLanguage,
    currentContact: store.currentContact,
    contactCascadeIndex: store.contactCascadeIndex,
    smsSentCount: store.smsSentCount,
    emergencyCallMade: store.emergencyCallMade,
    currentLat: store.currentLat,
    currentLng: store.currentLng,
    statusLog: store.statusLog,
    isDone: store.machineState === 'DONE',
    isCallingEmergency: store.machineState === 'CALLING_EMERGENCY',
    isCallingContacts: store.machineState === 'CALLING_CONTACTS',
  };
}
