// The four tabs: Today, Sites, Reports, More. Detail screens (check-in, register,
// report, materials) are Stack screens in the root layout, above these tabs.

import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppHeader } from '../../screens/AppHeader';
import { colors } from '../../theme';
import { Icon, type IconName } from '../../ui/Icon';

const TABS: { name: string; key: 'today' | 'sites' | 'reports' | 'more'; icon: IconName }[] = [
  { name: 'index', key: 'today', icon: 'today' },
  { name: 'sites', key: 'sites', icon: 'sites' },
  { name: 'reports', key: 'reports', icon: 'report' },
  { name: 'more', key: 'more', icon: 'more' },
];

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        header: ({ options, route }) => <AppHeader title={options.title ?? ''} showSync={route.name !== 'index'} />,
        // The darker orange: the bright one is too pale as text on white (docs/DESIGN.md section 5).
        tabBarActiveTintColor: colors.actionText,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.ground },
      }}
    >
      {TABS.map(({ name, key, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: t(`tabs.${key}`),
            tabBarIcon: ({ color }) => <Icon name={icon} size={24} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
