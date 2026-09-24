const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://yhanxndaqbmuzbdqlblu.supabase.co';
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_RWvrYHzgLMvBousgwn4dTg_QawYzwRS';

const QC_SESSION_KEY = 'buklod_quickcheck_session_v1';
const QC_BEARER_KEY = 'buklod_quickcheck_bearer_v1';

export class EconomyError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function authHeaders() {
  const headers: Record<string, string> = {
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json',
  };
  const opaque = localStorage.getItem(QC_SESSION_KEY) || '';
  const bearer = localStorage.getItem(QC_BEARER_KEY) || '';
  if (opaque) headers['x-quickcheck-session'] = opaque;
  else if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return headers;
}

export async function economyInvoke(slug: string, body: unknown) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new EconomyError(data?.error || `QuickCheck economy request failed (${response.status})`, response.status, data);
  }
  return data;
}

export function peso(minor: number | null | undefined) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format((Number(minor) || 0) / 100);
}

export const adsenseClient = import.meta.env.VITE_ADSENSE_CLIENT || '';
export const adsenseDashboardSlot = import.meta.env.VITE_ADSENSE_SLOT_DASHBOARD || '';
