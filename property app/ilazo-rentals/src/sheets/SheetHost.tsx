import React from 'react';
import { useUi } from '../state/UiProvider';
import { RecordPaymentSheet } from './RecordPaymentSheet';
import { NewTenantSheet } from './NewTenantSheet';
import { AddUnitSheet } from './AddUnitSheet';
import { EditUnitSheet } from './EditUnitSheet';
import { EditTenantSheet } from './EditTenantSheet';
import { TenantHistorySheet } from './TenantHistorySheet';
import { ReceiptSheet } from './ReceiptSheet';
import { StatementSheet } from './StatementSheet';

/** Renders whichever bottom sheet is currently open (they overlay the whole app, incl. the tab bar). */
export function SheetHost() {
  const { sheet, closeSheet } = useUi();
  if (!sheet) return null;
  switch (sheet.kind) {
    case 'collect':
      return <RecordPaymentSheet unitId={sheet.unitId} onClose={closeSheet} />;
    case 'newTenant':
      return <NewTenantSheet unitId={sheet.unitId} onClose={closeSheet} />;
    case 'addUnit':
      return <AddUnitSheet onClose={closeSheet} />;
    case 'editUnit':
      return <EditUnitSheet unitId={sheet.unitId} onClose={closeSheet} />;
    case 'editTenant':
      return <EditTenantSheet unitId={sheet.unitId} onClose={closeSheet} />;
    case 'tenantHist':
      return <TenantHistorySheet unitId={sheet.unitId} tenant={sheet.tenant} onClose={closeSheet} />;
    case 'receipt':
      return <ReceiptSheet receipt={sheet.receipt} onClose={closeSheet} />;
    case 'statement':
      return <StatementSheet statement={sheet.statement} onClose={closeSheet} />;
    default:
      return null;
  }
}
