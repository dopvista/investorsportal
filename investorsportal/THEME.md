# InvestorsPortal Theme & Color System

> This document defines the color tokens, icon system, modal standards,
> table patterns, and responsive rules used throughout the application.
> All new UI work MUST reference these standards to ensure visual
> consistency across light/dark themes and mobile/desktop views.

## 0. Core Policy: Color Separation for Better Visibility

**Every UI element must maintain clear visual separation between its layers.**

### The Rule
For any icon container, stat card, or badge:
1. **Background** — pale pastel tint of accent color (same in both themes)
2. **Border** — matching pastel border (same in both themes)
3. **Icon stroke** — `#374151` (dark gray-700), `sw={2.2–2.4}` (never gray, never `currentColor`)
4. **Text** — must contrast with both the background and the accent

### Stat Card Icon Badge (mandatory for all stat cards)
Each stat card icon gets a **distinct pale pastel background** based on its accent color,
with a **bold dark gray icon**. Same colors in BOTH light and dark themes.

### Pale Pastel Palette (per accent)

| Accent  | Background | Border    | Used For                                              |
|---------|------------|-----------|------------------------------------------------------|
| Blue    | `#DBEAFE`  | `#BFDBFE` | Companies, Holdings, Total Users, navy accents        |
| Green   | `#D1FAE5`  | `#A7F3D0` | Active, Verified, Activate button, green accents      |
| Red     | `#FEE2E2`  | `#FECACA` | Deactivate button, errors, red accents                |
| Amber   | `#FEF3C7`  | `#FDE68A` | Awaiting Action, pending, gold accents                |
| Purple  | `#EDE9FE`  | `#DDD6FE` | Data Entrants, purple accents                         |
| Teal    | `#CCFBF1`  | `#99F6E4` | Teal accents                                          |

Icon stroke for ALL badges: `#374151` (gray-700, bold dark gray), `sw={2.2}`

```jsx
<div style={{
  background: "#DBEAFE",         // pale blue (or matching pastel)
  border: "1.5px solid #BFDBFE", // matching pastel border
  color: "#374151",              // dark gray for icon stroke
}}>
  <Icon name="..." size={17} sw={2.2} />
</div>
```

### Why Pale Pastels + Dark Gray
- Each card gets a visually distinct colored badge — blue, green, red, amber etc
- Pale pastels provide strong fill on BOTH white (light) and navy (dark) card backgrounds
- Bold dark gray `#374151` icons contrast well against any pastel without being harsh
- Same values in both themes = no per-theme logic needed, fewer bugs

### Section Header IconBadge (different from stat cards)
Section headers still use per-section accent-tinted badges via `<IconBadge>`.
These use theme-adaptive opacity (stronger in dark mode).

---

## 1. Color Tokens

Colors are managed in `src/lib/theme.jsx` via two constant objects: `LIGHT_C` and `DARK_C`.
Components access them through `useTheme()` which returns `{ C, isDark }`.

### Brand Colors (same in both themes unless noted)

| Token        | Light           | Dark            | Usage                                  |
|-------------|-----------------|-----------------|----------------------------------------|
| `C.navy`    | `#0B1F3A`       | `#0B1F3A`       | Sidebar, header gradient, button hover |
| `C.navyLight`| `#132844`      | `#132844`       | Sidebar hover state, modal header gradient end |
| `C.green`   | `#00843D`       | `#28C062`       | Primary actions, success, active CDS border, passkey expanded border |
| `C.greenLight`| `#00a34c`     | `#32D670`       | Green hover state                      |
| `C.gold`    | `#F59E0B`       | `#F0B429`       | Warnings, profile picture tip box      |
| `C.red`     | `#EF4444`       | `#EF6E6E`       | Errors, delete buttons, required marks |

### Surface Colors

| Token        | Light           | Dark            | Usage                                  |
|-------------|-----------------|-----------------|----------------------------------------|
| `C.white`   | `#FAFBFC`       | `#1D2E42`       | Card background, button default bg     |
| `C.gray50`  | `#F0F4F8`       | `#141C27`       | Page background, section headers, table header bg |
| `C.gray100` | `#E8EDF3`       | `#1E2D3F`       | Section borders, tab container bg      |
| `C.gray200` | `#D4DCE6`       | `#2C3E55`       | Card borders, inactive button borders, scrollbar thumb (dark) |

### Text Colors

| Token        | Light           | Dark            | Usage                                  |
|-------------|-----------------|-----------------|----------------------------------------|
| `C.text`    | `#182235`       | `#D0DCE8`       | Primary text, headings, names          |
| `C.gray400` | `#94A3B8`       | `#7A8FA6`       | Secondary text, timestamps, labels     |
| `C.gray500` | `#64748B`       | `#96AABB`       | Tertiary text, counters, table column headers |
| `C.gray600` | `#475569`       | `#AABDCC`       | Body text (less used)                  |
| `C.gray800` | `#1E293B`       | `#C8D8E8`       | Strong secondary headings              |

### Semantic Surfaces

| Token        | Light           | Dark            | Usage                                  |
|-------------|-----------------|-----------------|----------------------------------------|
| `C.redBg`   | `#FEF2F2`       | `#2A1919`       | Error message background               |
| `C.greenBg` | `#F0FDF4`       | `#152B1E`       | Success message background             |

---

## 2. Modal & Popup Standards

All modals/popups MUST follow these standards for visual consistency.

### Backdrop (overlay)
```
background: rgba(10, 37, 64, 0.56)
backdropFilter: blur(3px)
zIndex: 9999
position: fixed; inset: 0
display: flex; alignItems: center (desktop) / flex-end (mobile bottom-sheet)
justifyContent: center
padding: 24px (desktop) / 0 (mobile)
```

### Modal Card
```
borderRadius: 18 (desktop) / "18px 18px 0 0" (mobile bottom-sheet)
border: 1.5px solid C.gray200
borderBottom: none (mobile)
boxShadow: 0 24px 64px rgba(0,0,0,0.3)
animation: fadeIn 0.2s ease
maxHeight: 92vh (mobile)
```

### Modal Header
```
background: linear-gradient(135deg, C.navy 0%, C.navyLight 100%)
padding: "18px 20px 14px" (mobile) / "18px 24px 14px" (desktop)
borderRadius: "18px 18px 0 0"
```
- **Title**: `fontSize: 16, fontWeight: 800, color: "#ffffff"`
- **Subtitle**: `fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 600`

### Close Button (mandatory for all modals)
```jsx
<button style={{
  width: 36, height: 36, borderRadius: "50%",
  border: "none",
  background: "rgba(255,255,255,0.15)",
  transition: "background 0.15s",
}}
  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.25)"}
  onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
>
  <Icon name="x" size={16} stroke="#ffffff" sw={2.2} />
</button>
```
**Never use** the `✕` character — always `<Icon name="x" />`.

### Footer Buttons — Close vs Cancel
- **Close**: Use when the popup is **view-only** (no form, no data entry). Small, right-aligned.
- **Cancel + Confirm**: Use when the popup is a **form** with data to submit. Compact buttons, right-aligned.
- Buttons should be compact (`padding: 7-8px 16-24px, fontSize: 11-12`) — never full-width `flex:1`.

### Footer Bar
```
padding: "14px 24px" (desktop) / "12px 18px" (mobile)
borderTop: 1px solid C.gray200
background: C.gray50
borderRadius: "0 0 18px 18px" (desktop) / 0 (mobile)
display: flex; gap: 10; justifyContent: flex-end
```

---

## 3. Table Standards

All data tables follow the same pattern for consistency.

### Table Container
- Wrapped in `<SectionCard>` with title and optional subtitle
- Desktop: fixed page height `calc(100vh - 118px)`, table scrolls internally
- Mobile: natural page scroll

### Table Header (thead)
```
position: sticky; top: 0; zIndex: 2
background: isDark ? C.gray50 : "#F0F4F8"  (opaque, no bleed-through)
fontSize: 10px
fontWeight: 700
textTransform: uppercase
letterSpacing: 0.07em
color: C.gray400
borderBottom: 2px solid C.gray200
```

### Table Body Rows
```
padding: "8px 14px" (compact, like Brokers) or "10px 16px" (standard)
borderBottom: 1px solid C.gray100
hover: background C.gray50
```

### Table Footer
```
padding: "10px 16px"
borderTop: 1px solid C.gray200
background: C.gray50
```
Shows: `Showing 1–N of M` with pagination controls if needed.

### Scrollbar (tables and scrollable areas)
```css
.scroll-class::-webkit-scrollbar { width: 4px; height: 4px; }
.scroll-class::-webkit-scrollbar-track { background: transparent; }
.scroll-class::-webkit-scrollbar-thumb {
  background: isDark ? C.gray200 : "#cbd5e1";
  border-radius: 10px;
}
.scroll-class { scrollbar-width: thin; scrollbar-color: [thumb] transparent; }
```
- Light theme: `#cbd5e1` thumb
- Dark theme: `C.gray200` thumb
- Always thin, always transparent track

---

## 4. Icon System

All icons use **Lucide-style SVG** via `<Icon name="..." />` from `src/lib/icons.jsx`.
**Emojis are NOT used** for any structural UI — no headers, navigation, labels, tab icons,
stat cards, buttons, error messages, or status badges.

### Import
```jsx
import { Icon, IconBadge } from "../lib/icons";
<Icon name="shield" size={14} stroke={C.gray500} />
```

### Complete Icon Reference (defined in `ICON_PATHS`)

#### Navigation & Structure
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `home`        | Dashboard navigation                     |
| `menu`        | Hamburger menu                           |
| `chevronDown` | Expand indicators, dropdowns             |
| `chevronRight`| Breadcrumbs, list navigation             |
| `chevronLeft` | Back navigation                          |
| `x`           | Close buttons, dismiss, clear inputs     |
| `search`      | Search inputs, filter triggers           |
| `refresh`     | Reload/refresh actions                   |
| `externalLink`| Open in new tab, Sign Out icon           |

#### Security & Auth
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `shield`      | Security section headers                 |
| `lock`        | CDS account badge, locked items          |
| `key`         | Change Password button                   |
| `fingerprint` | Biometric Passkeys button                |
| `eye`         | Show password toggle                     |
| `eyeOff`      | Hide password toggle                     |

#### Users & People
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `user`        | Account Information, Personal tab, profile|
| `users`       | User Management, corporate accounts      |

#### Buildings & Business
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `building`    | Account Type, Holdings stat, companies   |
| `briefcase`   | Business/portfolio contexts              |

#### Documents & Data
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `clipboard`   | More Info tab, awaiting review stat      |
| `fileText`    | Document references                      |
| `barChart`    | Portfolio/statistics charts, Avg. Price  |
| `trendingUp`  | Price history, growth indicators         |
| `pieChart`    | Distribution charts                      |

#### Actions
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `edit`        | Edit company, edit transaction, edit broker |
| `trash`       | Delete items, remove passkey             |
| `save`        | Save buttons                             |
| `plus`        | Add device, add items, create new record |
| `minus`       | Remove/decrease                          |
| `download`    | Download template, export                |
| `upload`      | Import transactions, upload files        |

#### Status & Feedback
| Key              | Usage                                  |
|-----------------|----------------------------------------|
| `check`         | Single checkmark, confirm action       |
| `checkCircle`   | Verified/confirmed, Active status, Activate button |
| `xCircle`       | Rejected status, errors                |
| `alertTriangle` | Warnings, error messages, No Role stat |
| `alertCircle`   | Info alerts, validation errors         |
| `info`          | Help tooltips, information             |
| `ban`           | Deactivate button, blocked, forbidden  |
| `clock`         | Pending status, time-based             |
| `hourglass`     | Processing, waiting                    |

#### Finance & Money
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `dollarSign`  | Price setting, financial amounts, Not Priced stat |
| `wallet`      | Account balances                         |
| `trophy`      | Highest price, achievements              |

#### Media
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `image`       | Profile picture tip, gallery, Login Page |
| `camera`      | Take a photo option                      |

#### Location
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `mapPin`      | Contact Details section                  |
| `globe`       | Nationality, international               |

#### Theme
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `sun`         | Light theme toggle, App Theme icon       |
| `moon`        | Dark theme toggle                        |
| `settings`    | System Settings nav, default theme       |

#### Arrows
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `arrowLeft`   | Back navigation                          |
| `arrowRight`  | Forward, next                            |
| `arrowUp`     | Upload indicator                         |
| `arrowDown`   | Download indicator                       |
| `undo`        | Unverify, revert action                  |

#### Misc
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `inbox`       | Import/export data                       |
| `send`        | Send/submit actions                      |
| `filter`      | Filter controls                          |
| `tag`         | Labels, categories                       |

### Icon Sizing Standards

| Context                  | Size   | Stroke Width |
|-------------------------|--------|-------------|
| Navigation sidebar       | 20px   | 1.8         |
| Section headers          | 13-14px| 1.8         |
| Button inline icons      | 13-15px| 2.0-2.2     |
| Tab icons (mobile)       | 14px   | 1.8         |
| Stat card icons          | 15-17px| 2.2         |
| CDS badge (mobile)       | 12px   | 2.0         |
| CDS badge (desktop)      | 15px   | 2.0         |
| Delete/action icons      | 13-15px| 2.0         |
| Plus (add items)         | 11-13px| 2.5         |
| Error screen icons       | 40px   | 1.5         |
| Bottom nav (mobile)      | 22px   | 1.8         |
| Modal close button       | 16px   | 2.2         |
| Pale pastel badge        | 13-15px| 2.2         |

### When Emojis ARE Acceptable
- Avatar camera overlay (small `📷` on the green circle — too small for SVG)
- These are small functional indicators, not structural UI.

---

## 5. Header Stats Bar (Desktop)

The top header shows page-level stats in badge format.

### Holdings Badge (dark mode visible)
```
background: isDark ? "#1e3a5f" : "#DBEAFE"
border: isDark ? "#2c4f7a" : "#BFDBFE"
icon stroke: isDark ? "#7EB3FF" : "#374151"
```

### Transactions Badge
```
background: isDark ? C.green + "30" : C.green + "12"
border: isDark ? C.green + "50" : C.green + "25"
```

---

## 6. Usage Patterns on Profile Page

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
- **Icon**: SVG stroke `C.gray500` (see Icon System)
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

## 7. Responsive Pattern

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
| Modals           | Bottom-sheet (flex-end)   | Centered card              |
| Table scroll     | Natural page scroll       | Internal scroll within SectionCard |

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

## 8. Checkbox & Form Controls

### Checkbox accent
- `accentColor: C.green` in both light and dark themes
- Size: `width: 15, height: 15`

### Form Inputs (Record Transaction, Invite User, etc.)
- Select buttons: `whiteSpace: "nowrap"`, `overflow: "hidden"`, `textOverflow: "ellipsis"`
- Dropdown items: same overflow handling to prevent text wrapping
- Focus border: `C.green`
- Blur border: `C.gray200`

---

## 9. CDS Switch Popup

Layout order (centered, no emoji):
1. **"Switch to CDS-XXXXXX?"** — centered title
2. **Current / New table** — side by side with arrow, showing CDS numbers + owner names
3. **Message** — "All portfolio data will update to reflect this CDS account."
4. **Cancel + Yes, Switch Account** buttons

---

## 10. Company Form Modal

- Field "Sector" (not "Remarks") — `placeholder: "e.g. Banking, Telecom, Energy..."`
- Master Company Registry table header: "Sector" column
- Portfolio Holdings table: shows `c.remarks` as subtitle under company name

---

## 11. Adding New Colors or Tokens

1. Add the token to BOTH `LIGHT_C` and `DARK_C` in `src/lib/theme.jsx`
2. Document it in this file under the appropriate table
3. Access via `const { C } = useTheme()` — never hardcode hex values
4. Test in both light and dark mode
5. Test on both mobile (< 768px) and desktop views

### Hardcoded Colors (Exceptions)
These are intentionally hardcoded and do NOT change per theme:
- `#ffffff` — button text on colored backgrounds (navy, green, red)
- `#374151` — icon stroke in pale pastel badges (both themes)
- `#9ca3af` — input placeholder text
- `#F0F4F8` — opaque table header background (light mode)
- Navy gradient (`C.navy -> C.navyLight`) — modal headers, profile banner
- Pale pastel palette (Section 0) — same values in both themes
- Role-specific dark colors (`ROLE_DARK_TEXT` map)
