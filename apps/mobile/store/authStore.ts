import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthState {
  // State
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isOnboarded: boolean; // true when the user has completed the full setup flow

  // Actions
  initialize: () => Promise<void>;
  setSession: (session: Session | null) => void;
  setOnboarded: (value: boolean) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  isLoading: true,
  isOnboarded: false,

  initialize: async () => {
    try {
      // Get current session (restored from SecureStore by Supabase client)
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        // Check if user has completed onboarding by looking for their profile in the DB
        const { data: userProfile } = await supabase
          .from('users')
          .select('id, name, is_calibrated')
          .eq('id', session.user.id)
          .single();

        set({
          session,
          user: session.user,
          isOnboarded: !!userProfile?.name, // onboarded if profile name exists
          isLoading: false,
        });
      } else {
        set({ session: null, user: null, isOnboarded: false, isLoading: false });
      }

      // Subscribe to auth state changes (token refresh, sign out, etc.)
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
        });
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setSession: (session) =>
    set({ session, user: session?.user ?? null }),

  setOnboarded: (value) => set({ isOnboarded: value }),

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, isOnboarded: false });
  },
}));
