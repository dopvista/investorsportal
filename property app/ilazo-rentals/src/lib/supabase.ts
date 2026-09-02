/**
 * Supabase client — cloud backup & cross-device sync.
 *
 * The publishable key is safe to ship inside the app: `ilazo_snapshots` is
 * protected by row-level security keyed on auth.uid(), so this key on its own
 * grants access to nothing. Sessions are persisted in AsyncStorage so a signed
 * in phone stays signed in across restarts.
 *
 * This is the same Supabase project the Investors Portal uses, so the account
 * you sign in with here is your existing portal account. RLS keeps this app's
 * row private to you.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://isfhvxyltwlswctcfcku.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_10k8MpqVy3oVIKc-oEjYbA_CXJa5qTq';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based callbacks in a native app.
    detectSessionInUrl: false,
  },
});
