import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/TabBar';
import { usePalette } from '@/theme';

export default function TabsLayout() {
  const palette = usePalette();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'none',
        sceneStyle: { backgroundColor: palette.bg },
      }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="bestiario" />
      <Tabs.Screen name="atlas" />
      <Tabs.Screen name="cuaderno" />
    </Tabs>
  );
}
