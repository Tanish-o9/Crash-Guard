import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Custom storage adapter for the Supabase auth session, backed by expo-secure-store.
 *
 * expo-secure-store rejects/does not reliably persist values larger than ~2048
 * bytes. A Supabase session (access token + refresh token + user object) routinely
 * exceeds that, which caused the session to silently fail to save — so on the next
 * app launch there was no session and the user's profile/contacts appeared "lost".
 *
 * This adapter transparently splits large values into <2048-byte chunks across
 * multiple keys and reassembles them on read, keeping tokens encrypted on-device.
 */
const CHUNK_SIZE = 1800; // safely under the 2048-byte SecureStore limit
const CHUNK_MARKER = '__cg_chunks__:'; // marks a chunked value + stores the count

async function clearChunks(key: string): Promise<void> {
  const meta = await SecureStore.getItemAsync(key);
  if (meta && meta.startsWith(CHUNK_MARKER)) {
    const count = parseInt(meta.slice(CHUNK_MARKER.length), 10) || 0;
    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(`${key}__${i}`);
    }
  }
}

const SecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const meta = await SecureStore.getItemAsync(key);
    if (meta == null) return null;
    if (!meta.startsWith(CHUNK_MARKER)) return meta; // small/legacy value stored directly
    const count = parseInt(meta.slice(CHUNK_MARKER.length), 10) || 0;
    let out = '';
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}__${i}`);
      if (part == null) return null; // corrupt/partial — treat as no session
      out += part;
    }
    return out;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    await clearChunks(key); // remove any previous chunks before rewriting
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${key}__${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(key, `${CHUNK_MARKER}${count}`);
  },

  removeItem: async (key: string): Promise<void> => {
    await clearChunks(key);
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? localStorage : SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
