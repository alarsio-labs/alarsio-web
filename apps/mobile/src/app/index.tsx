import Constants from 'expo-constants';

import { readPublicConfig } from '../config/public-config';
import { openDeviceDb } from '../db/open-device-db';
import { HomeScreen } from '../screens/HomeScreen';

export default function Index() {
  return (
    <HomeScreen
      openDb={openDeviceDb}
      config={readPublicConfig()}
      appVersion={Constants.expoConfig?.version ?? 'unknown'}
    />
  );
}
