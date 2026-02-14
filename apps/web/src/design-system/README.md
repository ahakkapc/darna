# Design System — Darna Premium (SPEC-UI-40)

## Source of Truth

All UI must import from `@/design-system` — **never hardcode** colors, spacing, or shadows directly.

## Tokens (`tokens.ts`)

| Category | Keys |
|----------|------|
| Colors | `colors.bg[0-2]`, `colors.text[0-2]`, `colors.brand.*`, `colors.state.*`, `colors.border[0-1]`, `colors.focus.ring` |
| Typography | `typography.fontFamily`, `typography.fontMono`, `typography.scale.{xs,sm,md,lg,xl,2xl}`, `typography.weight.{regular,medium,semibold,bold}` |
| Spacing | `spacing[0,1,2,3,4,5,6,8,10,12]` → 0–48px (base 4px) |
| Radius | `radius.{sm,md,lg,xl,pill}` → 8–999px |
| Shadows | `shadows.{sm,md,lg}` |
| Icons | `iconSize.{action=16, nav=20, hero=24, xl=32, xxl=48}` |

## Rules

1. **No hardcoded colors** (`#xxx`, `rgb(...)`, `text-blue-500` etc.) in pages.
2. **No direct MUI imports for primitives** — use `DS*` components.
3. **All statuses** displayed via `DSBadge` / `DSStatusBadge`.
4. **All pages** must handle loading/empty/error states.
5. **No direct fetch** in components — use `lib/*` API services + hooks.
6. **Icon sizes**: 16 (actions), 20 (nav), 24 (hero).
7. **Font**: Inter (main), JetBrains Mono (code/IDs).

## Components

| Component | Import | Key Props |
|-----------|--------|-----------|
| `DSButton` | `@/design-system` | `variant: primary\|secondary\|ghost\|danger`, `size: sm\|md\|lg`, `loading`, `confirm` |
| `DSInput` / `DSTextarea` | `@/design-system` | `label`, `hint`, `error`, `prefix`, `suffix`, `onEnter` |
| `DSBadge` / `DSStatusBadge` | `@/design-system` | `variant: neutral\|success\|warn\|danger\|info\|brand`, `label` |
| `DSCard` | `@/design-system` | `title`, `subtitle`, `actions`, `hoverable`, `elevated`, `noPadding` |
| `DSTable` | `@/design-system` | `columns`, `rows`, `rowKey`, `onRowClick`, `loading`, `empty`, `stickyHeader`, `footer` |
| `DSTabs` | `@/design-system` | `value`, `onChange`, `items: {label, count?}[]` |
| `DSDrawer` | `@/design-system` | `open`, `onClose`, `title`, `width`, `actions`, `closeOnOverlay` |
| `DSModal` / `DSConfirmModal` | `@/design-system` | `open`, `onClose`, `title`, `actions`, `maxWidth` |
| `DSEmptyState` / `DSErrorState` / `DSNotFoundState` | `@/design-system` | `title`, `desc`, `cta`, `requestId` |
| `DSSkeletonRows` / `DSSkeletonCard` | `@/design-system` | `rows`, `cols` |

## Patterns

| Pattern | Import | Usage |
|---------|--------|-------|
| `PageHeader` | `@/design-system` | Title + subtitle + actions + breadcrumbs |
| `PageBody` | `@/design-system` | Max-width container with responsive padding |
| `PageSection` | `@/design-system` | Grid layout (1/2/3 columns) |
| `DataListFilters` | `@/design-system` | Search + filters bar (sticky) |
| `DataListLoadMore` | `@/design-system` | Cursor-based pagination |

## Example

```tsx
import { PageBody, PageHeader, DSTable, DSButton, DSBadge, DSEmptyState } from '@/design-system';

export default function MyPage() {
  return (
    <PageBody>
      <PageHeader title="Leads" actions={<DSButton leftIcon={<Plus size={16} />}>Nouveau</DSButton>} />
      <DSTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={loading}
        empty={{ title: 'Aucun lead', cta: { label: 'Créer', onClick: create } }} />
    </PageBody>
  );
}
```
