import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import 'react-native-url-polyfill/auto';

/*
 * RELLENA ESTOS DOS VALORES con los de tu proyecto de Supabase:
 *   Supabase > Project Settings > API
 *   - Project URL            ->  SUPABASE_URL
 *   - anon / publishable key ->  SUPABASE_ANON_KEY   (la clave PÚBLICA, nunca la "service_role")
 */
const SUPABASE_URL = 'https://dvzxfvhhzgyngmiqpaet.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_28P-3l7RRM-_7h4Nuc9Lkw_ovljHcKL';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage, // así la sesión se mantiene al cerrar la app
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Renovar la sesión solo cuando la app está abierta
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
