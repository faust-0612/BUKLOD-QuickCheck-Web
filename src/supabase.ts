import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL || 'https://yhanxndaqbmuzbdqlblu.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_RWvrYHzgLMvBousgwn4dTg_QawYzwRS';
export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
export const functionUrl = (slug: string) => `${url}/functions/v1/${slug}`;
