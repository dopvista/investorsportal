# InvestorsPortal Theme & Color System

> This document defines the color tokens, icon system, and responsive patterns
> used throughout the application. All new UI work MUST reference these standards
> to ensure visual consistency across light/dark themes and mobile/desktop views.

---

## 1. Color Tokens

Colors are managed in `src/lib/theme.jsx` via two constant objects: `LIGHT_C` and `DARK_C`.
Components access them through `useTheme()` which returns `{ C, isDark }`.

### Brand Colors (same in both themes unless noted)

| Token        | Light           | Dark            | Usage                                  |
|-------------|-----------------|-----------------|----------------------------------------|
| `C.navy`    | `#0B1F3A`       | `#0B1F3A`       | Sidebar, header gradient, button hover |
| `C.navyLight`| `#132844`      | `#132844`       | Sidebar hover state                    |
| `C.green`   | `#00843D`       | `#28C062`       | Primary actions, success, active CDS border, passkey expanded border |
| `C.greenLight`| `#00a34c`     | `#32D670`       | Green hover state                      |
| `C.gold`    | `#F59E0B`       | `#F0B429`       | Warnings, profile picture tip box      |
| `C.red`     | `#EF4444`       | `#EF6E6E`       | Errors, delete buttons, required marks |

### Surface Colors

| Token        | Light           | Dark            | Usage                                  |
|-------------|-----------------|-----------------|----------------------------------------|
| `C.white`   | `#FAFBFC`       | `#1D2E42`       | Card background, button default bg     |
| `C.gray50`  | `#F0F4F8`       | `#141C27`       | Page background, section headers       |
| `C.gray100` | `#E8EDF3`       | `#1E2D3F`       | Section borders, tab container bg      |
| `C.gray200` | `#D4DCE6`       | `#2C3E55`       | Card borders, inactive button borders, scrollbar thumb (dark) |

### Text Colors

| Token        | Light           | Dark            | Usage                                  |
|-------------|-----------------|-----------------|----------------------------------------|
| `C.text`    | `#182235`       | `#D0DCE8`       | Primary text, headings, names          |
| `C.gray400` | `#94A3B8`       | `#7A8FA6`       | Secondary text, timestamps, labels     |
| `C.gray500` | `#64748B`       | `#96AABB`       | Tertiary text, counters (e.g. "2/3 today") |
| `C.gray600` | `#475569`       | `#AABDCC`       | Body text (less used)                  |
| `C.gray800` | `#1E293B`       | `#C8D8E8`       | Strong secondary headings              |

### Semantic Surfaces

| Token        | Light           | Dark            | Usage                                  |
|-------------|-----------------|-----------------|----------------------------------------|
| `C.redBg`   | `#FEF2F2`       | `#2A1919`       | Error message background               |
| `C.greenBg` | `#F0FDF4`       | `#152B1E`       | Success message background             |

---

## 2. Usage Patterns on Profile Page

### Password Change Progress Bars
- **Used bar**: `isDark ? C.green : C.navy` (bright green on dark, navy on light)
- **Unused bar**: `isDark ? C.gray200 : C.gray400` (visible in both themes)
- **Counter text**: `C.gray500` (readable in both themes)

### Buttons (Change Password, Biometric Passkeys)
- **Default**: `background: C.white`, `border: 1.5px solid C.gray200`, `color: C.text`
- **Hover**: `background: C.navy`, `border: C.navy`, `color: #ffffff`
- **Expanded (passkeys)**: `border: 1.5px solid C.green` (no hover effect when open)
- **Text alignment**: Left-aligned with icon + gap

### Section Headers (Account Type, Security, etc.)
- **Background**: `C.gray50`
- **Border bottom**: `1px solid C.gray100`
- **Icon**: SVG stroke `C.gray500` (see Icon System below)
- **Title**: `C.text`, uppercase, 10px, weight 700, letter-spacing 0.06em

### Mobile Tab Bar (Personal / More Info)
- **Container**: `background: C.gray100`, `border: 1px solid C.gray200`, radius 12
- **Active tab**: `background: C.white`, `border: 1.5px solid (isDark ? C.green : C.navy)`,
  `color: (isDark ? C.green : C.navy)`, weight 700, shadow
- **Inactive tab**: `background: transparent`, `border: transparent`,
  `color: C.gray500`, weight 500

### Scrollbar (Desktop Sidebar)
- **Thumb**: `isDark ? C.gray200 : #e5e7eb`
- **Track**: transparent
- **Width**: 3px

---

## 3. Icon System

All section and action icons use **Lucide-style SVG** via the `SvgIcon` component.
Emojis are **NOT** used for section headers, labels, or tab icons.

### Available Icons (defined in `ICONS` map)

| Key           | Usage                              |
|--------------|------------------------------------|
| `shield`     | Security section header            |
| `building`   | Account Type section header        |
| `user`       | Account Information, Personal tab  |
| `clipboard`  | More Info tab                      |
| `mapPin`     | Contact Details section header     |
| `fingerprint`| Biometric Passkeys button          |
| `key`        | Change Password button             |
| `image`      | Profile Picture tip box            |

### Icon Sizing

| Context             | Size | Stroke Width |
|--------------------|------|-------------|
| Section headers     | 13px | 1.8         |
| Button inline icons | 13-15px | 2.0      |
| Tab icons (mobile)  | 14px | 1.8         |
| Delete icon (trash) | 13-15px | 2.0      |
| Plus (add device)   | 11-13px | 2.5      |

### When Emojis ARE Acceptable
- Avatar camera overlay (small `📷` on the green circle)
- Save button (`💾`)
- Success checkmark in modals (`✓`)
- Close button (`✕`)
- These are small functional indicators, not section labels.

---

## 4. Responsive Pattern

### Breakpoint
- `768px` — below = mobile, above = desktop
- Detected via `useIsMobile()` hook with 80ms debounce

### Layout Differences

| Aspect           | Mobile                    | Desktop                    |
|-----------------|---------------------------|----------------------------|
| Profile card     | Full-width card, tabs     | 280px left sidebar, scrollable |
| Form layout      | Single column, tabbed     | Two columns in right panel |
| Buttons          | `padding: 11px`, `fontSize: 14` | `padding: 7px`, `fontSize: 12` |
| Section icons    | 14px                      | 13px                       |
| Pull-to-refresh  | Enabled (touch gesture)   | Disabled                   |
| Page height      | `auto` (scrolls normally) | `calc(100vh - 118px)` fixed grid |

### Grid (Desktop)
```css
display: grid;
grid-template-columns: 280px 1fr;
grid-template-rows: minmax(0, 1fr);
height: 100%;
overflow: hidden;
```
Each column has `overflowY: auto` and `paddingBottom: 24px` for scroll breathing room.

---

## 5. Adding New Colors or Tokens

1. Add the token to BOTH `LIGHT_C` and `DARK_C` in `src/lib/theme.jsx`
2. Document it in this file under the appropriate table
3. Access via `const { C } = useTheme()` — never hardcode hex values
4. Test in both light and dark mode
5. Test on both mobile (< 768px) and desktop views

### Hardcoded Colors (Exceptions)
These are intentionally hardcoded and do NOT change per theme:
- `#ffffff` — button text on colored backgrounds (navy, green, red)
- `#9ca3af` — input placeholder text
- Navy gradient (`#0B1F3A → #1e3a5f`) — profile card header banner
- Role-specific dark colors (`ROLE_DARK_TEXT` map)
