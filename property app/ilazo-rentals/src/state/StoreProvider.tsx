import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from 'zustand';
import { createAppStore, type AppState, type AppStore } from '../../store/createStore';
import { todayISO } from '../../core/dates';
import type { ISODate } from '../../core/types';

const StoreContext = createContext<AppStore | null>(null);
const TodayContext = createContext<ISODate>(todayISO());

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createAppStore(AsyncStorage));
  const [today, setToday] = useState(() => todayISO());

  // "Today" must be the real current date: refresh when the app returns to the
  // foreground and once a minute (cheap — consumers re-render only on change).
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') setToday(todayISO());
    });
    const timer = setInterval(() => setToday(todayISO()), 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);

  return (
    <StoreContext.Provider value={store}>
      <TodayContext.Provider value={today}>{children}</TodayContext.Provider>
    </StoreContext.Provider>
  );
}

export function useAppStore(): AppStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useAppStore must be used inside StoreProvider');
  return store;
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(useAppStore(), selector);
}

/** The real current date as ISO — refreshed on foreground + every minute. */
export function useToday(): ISODate {
  return useContext(TodayContext);
}
