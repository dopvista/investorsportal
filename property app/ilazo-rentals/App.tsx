import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { colors } from './src/theme';
import { StoreProvider, useApp } from './src/state/StoreProvider';
import { SyncProvider } from './src/state/SyncProvider';
import { UiProvider } from './src/state/UiProvider';
import { AppNavigator } from './src/navigation';
import { SheetHost } from './src/sheets/SheetHost';
import { ToastHost } from './src/ui/Toast';

/** Hold rendering until the persisted state has been rehydrated from disk. */
function HydrationGate({ children }: { children: React.ReactNode }) {
  const hydrated = useApp((s) => s.hydrated);
  if (!hydrated) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return <>{children}</>;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <StoreProvider>
        {/* Sync sits inside the store (it reads/writes the ledger) but outside
            the UI so it keeps running regardless of which screen is open. */}
        <SyncProvider>
        <UiProvider>
          <HydrationGate>
            <View style={{ flex: 1, backgroundColor: colors.bg }}>
              <StatusBar style="dark" />
              <AppNavigator />
              <SheetHost />
              <ToastHost />
            </View>
          </HydrationGate>
        </UiProvider>
        </SyncProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
