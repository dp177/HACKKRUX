import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { authenticateWithGoogle, getCurrentUser, logoutAuth } from '../api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: '',
      isAuthenticated: false,
      loading: false,
      hydrated: false,

      setLoading: (loading) => set({ loading }),

      loginWithGoogle: async (idToken) => {
        set({ loading: true });
        try {
          const response = await authenticateWithGoogle(idToken);
          set({
            user: response.user,
            token: response.token,
            isAuthenticated: true,
            loading: false
          });
          return response;
        } catch (error) {
          set({ loading: false });
          throw error;
        }
      },

      loginWithToken: (token, user) => {
        set({ user, token, isAuthenticated: true, loading: false });
      },

      restoreSession: async () => {
        const token = get().token;
        if (!token) {
          return;
        }

        set({ loading: true });
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Session restore timed out')), 5000)
        );
        try {
          const response = await Promise.race([getCurrentUser(token), timeout]);
          set({
            user: response.user,
            isAuthenticated: true,
            loading: false
          });
        } catch {
          set({
            user: null,
            token: '',
            isAuthenticated: false,
            loading: false
          });
        }
      },

      logout: async () => {
        const token = get().token;
        try {
          if (token) {
            await logoutAuth(token);
          }
        } catch {
          // Best-effort logout for JWT flow
        }

        set({
          user: null,
          token: '',
          isAuthenticated: false,
          loading: false
        });
      }
    }),
    {
      name: 'triage-mobile-auth',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrated = true;
        }
      }
    }
  )
);
