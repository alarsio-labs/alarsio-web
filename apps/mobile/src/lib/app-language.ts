// The app's language, wired to the phone: AsyncStorage for the saved choice and the device language
// as the first-run default. Kept apart from i18n/language.ts so that file needs no native module.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';

import type { Language } from '../i18n';
import { initLanguage, setLanguage } from '../i18n/language';

export const startLanguage = () => initLanguage(AsyncStorage, getLocales()[0]?.languageCode);

export const changeLanguage = (language: Language) => void setLanguage(language, AsyncStorage);
