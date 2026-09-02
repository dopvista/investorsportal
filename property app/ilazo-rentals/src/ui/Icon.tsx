import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

/**
 * The design uses Material Symbols Rounded; @expo/vector-icons ships the
 * classic Material Icons font, so newer glyph names fall back gracefully.
 */
const FALLBACKS: Record<string, string[]> = {
  'add-card': ['add-card', 'payment', 'credit-card'],
  'diversity-1': ['diversity-1', 'people-alt', 'group'],
  'event-repeat': ['event-repeat', 'event', 'update'],
  'receipt-long': ['receipt-long', 'receipt'],
  'filter-alt': ['filter-alt', 'filter-list'],
  'event-available': ['event-available', 'event'],
  'south-west': ['south-west', 'call-received'],
  'north-east': ['north-east', 'call-made'],
  'person-add': ['person-add', 'person-add-alt-1'],
  'ios-share': ['ios-share', 'share'],
  'picture-as-pdf': ['picture-as-pdf', 'description'],
  'photo-camera': ['photo-camera', 'camera-alt'],
  'add-photo-alternate': ['add-photo-alternate', 'photo-library', 'image'],
  attachment: ['attachment', 'attach-file'],
  insights: ['insights', 'bar-chart'],
  payments: ['payments', 'account-balance-wallet'],
  domain: ['domain', 'business'],
  'domain-add': ['domain-add', 'add-business', 'add-home-work', 'add'],
  'manage-accounts': ['manage-accounts', 'person', 'edit'],
};

function resolve(name: string): any {
  const glyphs = (MaterialIcons as any).glyphMap ?? {};
  const candidates = FALLBACKS[name] ?? [name];
  for (const c of candidates) if (glyphs[c] != null) return c;
  return 'circle';
}

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 20, color, style }: IconProps) {
  return <MaterialIcons name={resolve(name)} size={size} color={color} style={style} />;
}
