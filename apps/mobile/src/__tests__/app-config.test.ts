// The pilot APK's build settings (pre-launch phone review, 12 Nov 2026). The first APK asked
// for permissions the app never uses, let Android back up its records, carried emulator code
// and had no version code a later build could rise above. These guard each setting.
import appJson from '../../app.json';
import easJson from '../../eas.json';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withArmOnly = require('../../plugins/with-arm-only.js') as {
  (config: Record<string, unknown>): Record<string, unknown>;
  ARCHITECTURES: string;
};

const android = appJson.expo.android as {
  permissions: string[];
  blockedPermissions: string[];
  allowBackup: boolean;
};

describe('Android build settings', () => {
  it('asks only for location by itself; camera and photos come from their own libraries', () => {
    expect(android.permissions).toEqual(['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION']);
  });

  it('removes the permissions libraries add but the app never uses', () => {
    expect(android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
        'android.permission.VIBRATE',
      ]),
    );
    // Still needed: location for check-in, and gallery access on Android 12 and older.
    for (const kept of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'READ_EXTERNAL_STORAGE', 'CAMERA']) {
      expect(android.blockedPermissions).not.toContain(`android.permission.${kept}`);
    }
  });

  it("keeps the phone's records out of Android's cloud backup", () => {
    // The outbox and the encrypted session must not be restored onto another phone, where the
    // session key (in the keystore) does not exist.
    expect(android.allowBackup).toBe(false);
  });

  it('gives every pilot build a higher version code', () => {
    expect(easJson.cli.appVersionSource).toBe('remote');
    expect(easJson.build.pilot.autoIncrement).toBe(true);
  });

  it('builds for ARM phones only, through the local plugin', () => {
    expect(appJson.expo.plugins).toContain('./plugins/with-arm-only.js');
    expect(withArmOnly.ARCHITECTURES).toBe('armeabi-v7a,arm64-v8a');
  });
});
