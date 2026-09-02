import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { Receipt, StatementData } from '../../core/statements';

export type ActiveSheet =
  | { kind: 'collect'; unitId?: string }
  | { kind: 'newTenant'; unitId?: string }
  | { kind: 'addUnit' }
  | { kind: 'editUnit'; unitId: string }
  | { kind: 'editTenant'; unitId: string }
  | { kind: 'tenantHist'; unitId: string; tenant: string }
  | { kind: 'receipt'; receipt: Receipt }
  | { kind: 'statement'; statement: StatementData }
  | null;

interface UiContextValue {
  sheet: ActiveSheet;
  openSheet(sheet: NonNullable<ActiveSheet>): void;
  closeSheet(): void;
  toast: string | null;
  showToast(msg: string, ms?: number): void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [sheet, setSheet] = useState<ActiveSheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, ms = 2600) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(msg);
    timer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const openSheet = useCallback((next: NonNullable<ActiveSheet>) => setSheet(next), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  const value = useMemo(
    () => ({ sheet, openSheet, closeSheet, toast, showToast }),
    [sheet, openSheet, closeSheet, toast, showToast],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const v = useContext(UiContext);
  if (!v) throw new Error('useUi must be used inside UiProvider');
  return v;
}
