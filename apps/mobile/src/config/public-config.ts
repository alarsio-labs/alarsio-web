// The public (EXPO_PUBLIC_*) settings the app needs, read from apps/mobile/.env.local.
// Only the publishable key ever goes here. The service-role key never does.

export interface PublicConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export type PublicConfigResult =
  | { ok: true; config: PublicConfig }
  | { ok: false; missing: string[] };

export function parsePublicConfig(values: {
  supabaseUrl: string | undefined;
  supabasePublishableKey: string | undefined;
}): PublicConfigResult {
  const missing: string[] = [];
  const supabaseUrl = values.supabaseUrl?.trim() ?? '';
  const supabasePublishableKey = values.supabasePublishableKey?.trim() ?? '';

  if (supabaseUrl === '') missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (supabasePublishableKey === '') missing.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, config: { supabaseUrl, supabasePublishableKey } };
}

export function readPublicConfig(): PublicConfigResult {
  // Expo inlines an EXPO_PUBLIC_* value only when it is read as
  // process.env.NAME, so these must not be destructured or read dynamically.
  return parsePublicConfig({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
