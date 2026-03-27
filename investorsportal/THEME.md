# InvestorsPortal Theme & Color System

> This document defines the color tokens, icon system, and responsive patterns
> used throughout the application. All new UI work MUST reference these standards
> to ensure visual consistency across light/dark themes and mobile/desktop views.

## 0. Core Policy: Color Separation for Better Visibility

**Every UI element must maintain clear visual separation between its layers.**

### The Rule
For any icon container, stat card, or badge:
1. **Background** — low-opacity tint of accent color (light: 10%, dark: 19%)
2. **Border** — medium-opacity ring of accent color (light: 21%, dark: 31%)
3. **Icon stroke** — full 100% accent color (never gray, never `currentColor` without `color` set)
4. **Text** — must contrast with both the background and the accent

### Icon Container Pattern (mandatory for all stat cards and badges)
```jsx
<div style={{
  background: `${accentColor}${isDark ? "40" : "22"}`,
  border: `1.5px solid ${accentColor}${isDark ? "60" : "40"}`,
  color: accentColor,  // ← ensures currentColor inheritance for child SVGs
}}>
  <Icon name="..." size={17} />
</div>
```

### Why
- In dark mode, low-opacity backgrounds on dark surfaces become invisible
- Without explicit `color` on the container, `currentColor` inherits page text color, not accent
- Without a border, the badge has no edge definition against the card background
- Dark mode needs ~2x opacity vs light mode to achieve equivalent contrast

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

All icons use **Lucide-style SVG** via `<Icon name="..." />` from `src/lib/icons.jsx`.
Emojis are **NOT** used for section headers, navigation, labels, or tab icons.

### Import
```jsx
import { Icon, ICON_PATHS } from "../lib/icons";
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
| `x`           | Close buttons, dismiss                   |
| `search`      | Search inputs, filter triggers           |
| `refresh`     | Reload/refresh actions                   |
| `externalLink`| Open in new tab                          |

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
| `barChart`    | Portfolio/statistics charts              |
| `trendingUp`  | Price history, growth indicators         |
| `pieChart`    | Distribution charts                      |

#### Actions
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `edit`        | Edit company, edit transaction           |
| `trash`       | Delete items, remove passkey             |
| `save`        | Save buttons                             |
| `plus`        | Add device, add items                    |
| `minus`       | Remove/decrease                          |
| `download`    | Download template, export                |
| `upload`      | Import transactions, upload files        |

#### Status & Feedback
| Key              | Usage                                  |
|-----------------|----------------------------------------|
| `check`         | Single checkmark, confirm action       |
| `checkCircle`   | Verified/confirmed status              |
| `xCircle`       | Rejected status, errors                |
| `alertTriangle` | Warnings, error screens                |
| `alertCircle`   | Info alerts, validation errors         |
| `info`          | Help tooltips, information             |
| `ban`           | Blocked, forbidden                     |
| `clock`         | Pending status, time-based             |
| `hourglass`     | Processing, waiting                    |

#### Finance & Money
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `dollarSign`  | Price setting, financial amounts         |
| `wallet`      | Account balances                         |
| `trophy`      | Highest price, achievements              |

#### Media
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `image`       | Profile picture tip, gallery             |
| `camera`      | Take a photo option                      |

#### Location
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `mapPin`      | Contact Details section                  |
| `globe`       | Nationality, international               |

#### Theme
| Key            | Usage                                    |
|---------------|------------------------------------------|
| `sun`         | Light theme toggle                       |
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
| Button inline icons      | 13-15px| 2.0         |
| Tab icons (mobile)       | 14px   | 1.8         |
| Stat card icons          | 14px   | 1.8         |
| CDS badge (mobile)       | 12px   | 2.0         |
| CDS badge (desktop)      | 15px   | 2.0         |
| Delete/action icons      | 13-15px| 2.0         |
| Plus (add items)         | 11-13px| 2.5         |
| Error screen icons       | 40px   | 1.5         |
| Bottom nav (mobile)      | 22px   | 1.8         |

### When Emojis ARE Acceptable
- Avatar camera overlay (small `📷` on the green circle — too small for SVG)
- Save button text (`💾 Save Changes`)
- These are small functional indicators within buttons, not structural UI.

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
