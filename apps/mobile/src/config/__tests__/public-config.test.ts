import { parsePublicConfig } from '../public-config';

describe('parsePublicConfig', () => {
  it('accepts both values', () => {
    expect(
      parsePublicConfig({
        supabaseUrl: 'https://example.supabase.co',
        supabasePublishableKey: 'sb_publishable_abc',
      }),
    ).toEqual({
      ok: true,
      config: {
        supabaseUrl: 'https://example.supabase.co',
        supabasePublishableKey: 'sb_publishable_abc',
      },
    });
  });

  it('names every missing value', () => {
    expect(parsePublicConfig({ supabaseUrl: undefined, supabasePublishableKey: undefined })).toEqual({
      ok: false,
      missing: ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
    });
  });

  it('treats a blank value as missing', () => {
    expect(
      parsePublicConfig({ supabaseUrl: '   ', supabasePublishableKey: 'sb_publishable_abc' }),
    ).toEqual({ ok: false, missing: ['EXPO_PUBLIC_SUPABASE_URL'] });
  });
});
