import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User, EmergencyContact, MedicalInfo, MountPosition, VehicleType, BloodGroup } from '@crashguard/types';

// ─── Onboarding draft (held in memory during setup flow) ─────────────────────

export interface OnboardingDraft {
  name: string;
  bloodGroup: BloodGroup;
  vehicleType: VehicleType;
  mountPosition: MountPosition;
  emergencyContacts: { name: string; phone: string; priorityOrder: 1 | 2 | 3 }[];
  medicalAllergies: string;
  medicalConditions: string;
}

const DEFAULT_DRAFT: OnboardingDraft = {
  name: '',
  bloodGroup: 'Unknown',
  vehicleType: 'motorcycle',
  mountPosition: 'handlebar',
  emergencyContacts: [],
  medicalAllergies: '',
  medicalConditions: '',
};

// ─── Store ────────────────────────────────────────────────────────────────────

interface UserStore {
  profile: User | null;
  emergencyContacts: EmergencyContact[];
  medicalInfo: MedicalInfo | null;
  onboardingDraft: OnboardingDraft;
  isLoading: boolean;
  error: string | null;

  // Draft mutations (during onboarding)
  updateDraft: (patch: Partial<OnboardingDraft>) => void;
  resetDraft: () => void;

  // DB operations
  loadProfile: (userId: string) => Promise<void>;
  saveProfile: (userId: string) => Promise<boolean>;
  saveEmergencyContacts: (userId: string) => Promise<boolean>;
  saveMedicalInfo: (userId: string) => Promise<boolean>;
  clearError: () => void;
}

export const useUserStore = create<UserStore>((set, get) => ({
  profile: null,
  emergencyContacts: [],
  medicalInfo: null,
  onboardingDraft: DEFAULT_DRAFT,
  isLoading: false,
  error: null,

  updateDraft: (patch) =>
    set(s => ({ onboardingDraft: { ...s.onboardingDraft, ...patch } })),

  resetDraft: () => set({ onboardingDraft: DEFAULT_DRAFT }),

  clearError: () => set({ error: null }),

  loadProfile: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const [profileRes, contactsRes, medicalRes] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId).single(),
        supabase
          .from('emergency_contacts')
          .select('*')
          .eq('user_id', userId)
          .order('priority_order'),
        supabase.from('medical_info').select('*').eq('user_id', userId).single(),
      ]);

      set({
        profile: profileRes.data as User | null,
        emergencyContacts: (contactsRes.data as EmergencyContact[]) ?? [],
        medicalInfo: medicalRes.data as MedicalInfo | null,
        isLoading: false,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
    }
  },

  saveProfile: async (userId) => {
    const { onboardingDraft } = get();
    set({ isLoading: true, error: null });
    try {
      // Fetch current auth user to get the phone number
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('users').upsert({
        id: userId,
        phone: user?.phone || '',
        name: onboardingDraft.name.trim(),
        blood_group: onboardingDraft.bloodGroup,
        vehicle_type: onboardingDraft.vehicleType,
        mount_position: onboardingDraft.mountPosition,
      });
      if (error) throw error;
      set({ isLoading: false });
      return true;
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      return false;
    }
  },

  saveEmergencyContacts: async (userId) => {
    const { onboardingDraft } = get();
    if (onboardingDraft.emergencyContacts.length === 0) return true;
    set({ isLoading: true, error: null });
    try {
      // Delete existing contacts first
      await supabase.from('emergency_contacts').delete().eq('user_id', userId);

      // Insert new contacts
      const { error } = await supabase.from('emergency_contacts').insert(
        onboardingDraft.emergencyContacts.map(c => ({
          user_id: userId,
          name: c.name.trim(),
          phone: c.phone.trim(),
          priority_order: c.priorityOrder,
        }))
      );
      if (error) throw error;
      set({ isLoading: false });
      return true;
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      return false;
    }
  },

  saveMedicalInfo: async (userId) => {
    const { onboardingDraft } = get();
    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase.from('medical_info').upsert({
        user_id: userId,
        blood_type: onboardingDraft.bloodGroup,
        allergies: onboardingDraft.medicalAllergies
          ? onboardingDraft.medicalAllergies.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        conditions: onboardingDraft.medicalConditions
          ? onboardingDraft.medicalConditions.split(',').map(s => s.trim()).filter(Boolean)
          : [],
      });
      if (error) throw error;
      set({ isLoading: false });
      return true;
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      return false;
    }
  },
}));
