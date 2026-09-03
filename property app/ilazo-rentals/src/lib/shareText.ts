/**
 * Share-message builders styled like a bank receipt (see CRDB's RISITI):
 * header → title with ✅ → big amount → label/value rows → reference/status.
 *
 * Uses WhatsApp text markup (*bold*, _italic_) — WhatsApp is how receipts are
 * shared here. Other targets (SMS/email) show the raw asterisks harmlessly.
 */
import type { Company } from '../../core/types';
import type { Receipt, StatementData } from '../../core/statements';
import { fmt } from '../../core/money';
import { fmtDate } from '../../core/dates';
import { DEFAULT_MOTTO } from '../../core/seed';

const LINE = '━━━━━━━━━━━━━━━━━━━━';

export function receiptShareText(company: Company, r: Receipt): string {
  return [
    `*${company.name.toUpperCase()}*`,
    `_${company.address}_`,
    LINE,
    `✅ *RENT RECEIPT*`,
    '',
    `*TZS ${fmt(r.amount)}*`,
    '',
    `Received from: *${r.tenant}*`,
    `Unit: *${r.unitName}*`,
    `For period: *${r.coverMonths}*`,
    `_${r.coverRange}_`,
    `Method: *${r.method}*`,
    `Date paid: *${fmtDate(r.date)}*`,
    `Receipt no: *${r.no}*`,
    LINE,
    `_${company.motto || DEFAULT_MOTTO}_`,
    LINE,
    `_${company.short || company.name} · TIN ${company.tin}_`,
    `_${company.phone}_`,
  ].join('\n');
}

export function statementShareText(company: Company, s: StatementData): string {
  const balanceValue =
    s.balance.kind === 'due'
      ? `TZS ${fmt(s.balance.amount)} due`
      : s.balance.kind === 'credit'
        ? `TZS ${fmt(s.balance.amount)} in advance`
        : 'Nil — up to date';
  const lines = [
    `*${company.name.toUpperCase()}*`,
    `_Tenant statement_`,
    LINE,
    `*${s.tenant}*`,
    `${s.unitName}${s.type ? ` · ${s.type}` : ''} · rent *${fmt(s.rent)}*/mo`,
    `_${s.periodLabel} · occupied since ${fmtDate(s.leaseStart)}_`,
    '',
    `Rent charged: *TZS ${fmt(s.charged)}*`,
    `_${s.chargedSub}_`,
    `Paid: *TZS ${fmt(s.received)}*`,
    `_${s.paidSub}_`,
    `${s.balance.label}${s.balance.at ? ` ${s.balance.at}` : ''}: *${balanceValue}*`,
    `_${s.balance.sub}_`,
    '',
    `Paid up to: *${fmtDate(s.coverEnd)}*`,
    LINE,
    `*PAYMENTS*`,
  ];
  if (s.pays.length === 0) {
    lines.push('_No payments in this period._');
  } else {
    for (const p of s.pays) {
      lines.push(`• ${fmtDate(p.date)} — *TZS ${fmt(p.amount)}*`);
      if (p.months || p.range) lines.push(`   _${[p.months, p.range].filter(Boolean).join(' · ')}_`);
    }
  }
  lines.push(LINE, `_${company.motto || DEFAULT_MOTTO}_`, LINE,
            `_${company.short || company.name} · TIN ${company.tin} · ${company.phone}_`);
  return lines.join('\n');
}
