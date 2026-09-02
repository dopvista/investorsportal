/** Small view-model helpers shared across screens (formatting + status colors). */
import type { ISODate, Unit } from '../core/types';
import { coveredThrough, dueOf, isOwnerOccupied, isVacant, monthsDue, periodProgressPct, statusOf } from '../core/engine';
import { fmt } from '../core/money';
import { fmtDate } from '../core/dates';
import { colors, statusColors } from './theme';

export interface UnitVM {
  unit: Unit;
  vacant: boolean;
  ownerOccupied: boolean;
  due: number;
  monthsBehind: number;
  statusLabel: string;
  statusKind: 'arrears' | 'ahead' | 'current' | 'vacant' | 'owner';
  statusBg: string;
  statusFg: string;
  dotColor: string;
  balanceLabel: string;
  balanceColor: string;
  coveredThrough: string;
  pct: number;
  barColor: string;
  tenureShort: string;
  tenureIcon: string;
}

export function unitVM(unit: Unit, today: ISODate): UnitVM {
  if (isVacant(unit)) {
    return {
      unit,
      vacant: true,
      ownerOccupied: false,
      due: 0,
      monthsBehind: 0,
      statusLabel: 'Vacant',
      statusKind: 'vacant',
      statusBg: colors.pastBg,
      statusFg: colors.faint,
      dotColor: colors.faint,
      balanceLabel: 'Vacant',
      balanceColor: colors.faint,
      coveredThrough: '—',
      pct: 0,
      barColor: colors.track,
      tenureShort: 'Ready to let',
      tenureIcon: 'apartment',
    };
  }
  if (isOwnerOccupied(unit)) {
    return {
      unit,
      vacant: false,
      ownerOccupied: true,
      due: 0,
      monthsBehind: 0,
      statusLabel: 'Owner-occupied',
      statusKind: 'owner',
      statusBg: colors.ownerBg,
      statusFg: colors.owner,
      dotColor: colors.ownerDot,
      balanceLabel: 'No rent',
      balanceColor: colors.owner,
      coveredThrough: '—',
      pct: 0,
      barColor: colors.track,
      tenureShort: 'Owner-occupied · no rent',
      tenureIcon: 'home',
    };
  }
  const due = dueOf(unit, today);
  const dm = monthsDue(unit.nextDue, today);
  const status = statusOf(due, unit.nextDue, today);
  const sc = statusColors(status.kind);
  return {
    unit,
    vacant: false,
    ownerOccupied: false,
    due,
    monthsBehind: dm,
    statusLabel: status.label,
    statusKind: status.kind,
    statusBg: sc.bg,
    statusFg: sc.fg,
    dotColor: sc.dot,
    balanceLabel: due > 0 ? `${fmt(due)} due` : 'Paid up',
    balanceColor: due > 0 ? colors.red : colors.green,
    coveredThrough: fmtDate(coveredThrough(unit.nextDue)),
    pct: periodProgressPct(unit.nextDue, today),
    barColor: due > 0 ? colors.red : colors.green,
    tenureShort: due > 0 ? `${dm}${dm === 1 ? ' month' : ' months'} overdue` : 'Paid up · on track',
    tenureIcon: due > 0 ? 'error' : 'check-circle',
  };
}

export const mw = (n: number) => `${n}${n === 1 ? ' month' : ' months'}`;
