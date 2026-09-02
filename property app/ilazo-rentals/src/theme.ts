/** Design tokens from the handoff README — single source for colors/type/radii. */
import { Dimensions } from 'react-native';

/**
 * Vertical-rhythm scale.
 *
 * The layout was tuned on the Z Fold cover display (~905dp tall). Shorter,
 * denser phones (e.g. the Oppo CPH2841 at 360x792dp) have ~113dp less height,
 * so the same spacing makes screens overflow. `vs()` lets a style ask for a
 * tighter value on short screens while leaving tall ones exactly as designed.
 *
 * The app is portrait-locked (app.json), so reading Dimensions once at module
 * load is safe — there is no rotation to react to.
 */
const WINDOW_HEIGHT = Dimensions.get('window').height;
export const isCompact = WINDOW_HEIGHT < 850;
/** `vs(tall, short)` — picks the short value only on compact screens. */
export const vs = (tall: number, short: number) => (isCompact ? short : tall);

export const colors = {
  bg: '#F6F1E9',
  ink: '#17241F',
  muted: '#66736C',
  muted2: '#7C897F',
  muted3: '#8A968E',
  faint: '#98A29A',
  chevron: '#B7BEB8',
  chevronFaint: '#C6CFC9',

  green: '#10715A',
  greenDark: '#0B5B45',
  gradA: ['#12805F', '#0B5B45'] as const,
  gradB: ['#15886B', '#0A5741'] as const,
  gradDark: ['#2A3F36', '#17241F'] as const,
  gradLogo: ['#13886A', '#0B5B45'] as const,
  mint: '#8FE3C4',
  coral: '#F0A897',

  red: '#BE4B33',
  redBg: '#F8E5DF',
  redLabel: '#A05B49',
  redSub: '#C79184',

  amber: '#B07417',
  amberBg: '#FBEFD9',
  amberInk: '#8A6A1F',
  amberLabel: '#7A5E1E',
  amberSub: '#C7A867',
  amberBorder: '#EAD9B4',

  // Owner-occupied (no rent) — a calm slate that reads as neutral, not a warning.
  ownerBg: '#E7EAF1',
  owner: '#4E5C7A',
  ownerDot: '#5E6C8C',

  greenPillBg: '#E4EFEA',
  greenTintBg: '#EEF4F1',
  previewBg: '#EBF3EF',
  previewBorder: '#D5E7DF',
  previewSub: '#5B6B62',
  previewMuted: '#8FA79A',

  card: '#FFFFFF',
  hairline: '#F3EEE4',
  hairline2: '#F0EBE1',
  hairline3: '#ECE6DB',
  inputBorder: '#E1D9CA',
  track: '#EFE9DF',
  tile: '#F7F3EC',
  tileDeep: '#FAF6EF',
  segment: '#EDE7DB',
  handle: '#D6CEBF',
  dashed: '#D9D1C2',
  avatarBg: '#EDEFF2',
  avatarFg: '#3C5147',
  pastBg: '#F1EDE4',
  dotIdle: '#C9D2CC',
  backdrop: 'rgba(14,21,18,0.5)',
};

export const font = {
  /** Space Grotesk — headings and figures */
  heading: 'SpaceGrotesk_700Bold',
  headingSemi: 'SpaceGrotesk_600SemiBold',
  headingMed: 'SpaceGrotesk_500Medium',
  /** Plus Jakarta Sans — body/UI */
  body: 'PlusJakartaSans_400Regular',
  bodyMed: 'PlusJakartaSans_500Medium',
  bodySemi: 'PlusJakartaSans_600SemiBold',
  bodyBold: 'PlusJakartaSans_700Bold',
  bodyXBold: 'PlusJakartaSans_800ExtraBold',
};

export const radius = {
  card: 20,
  cardLg: 22,
  hero: 28,
  heroDetail: 26,
  more: 24,
  input: 14,
  tile: 13,
  pill: 999,
  sheet: 30,
};

/** Soft card shadow (works on both platforms; Android uses elevation). */
export const cardShadow = {
  shadowColor: '#142820',
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
} as const;

export const heroShadow = (rgb: string) =>
  ({
    shadowColor: rgb,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  }) as const;

/** Status pill / text colors per engine status kind. */
export function statusColors(kind: 'arrears' | 'ahead' | 'current') {
  switch (kind) {
    case 'arrears':
      return { bg: colors.redBg, fg: colors.red, dot: colors.red };
    case 'ahead':
      return { bg: colors.amberBg, fg: colors.amber, dot: colors.amber };
    default:
      return { bg: colors.greenPillBg, fg: colors.green, dot: colors.green };
  }
}
