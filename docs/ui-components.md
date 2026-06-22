# UI Components

Small reusable UI primitives live in `components/ui`.

## Architecture

- `Button`: native button wrapper with variants, sizes, loading state and accessible disabled behavior.
- `Surface`: reusable panel/card container using the app's dark glass visual language.
- `SurfaceHeader`: consistent title, description and action slot for panels.
- `MetricCard`: KPI card with label, value, helper text, icon and accent line.
- `LoadingState`, `EmptyDataState`, `ErrorState`, `Spinner`, `Skeleton`: async states for pages, panels and inline actions.

## Props Design

```tsx
<Button
  variant="primary"
  size="md"
  loading={saving}
  loadingLabel="Salvando"
  leftIcon={<Save size={14} />}
>
  Salvar
</Button>
```

```tsx
<Surface>
  <SurfaceHeader
    title="Empresas ativas"
    description="Ranking por colaboradores"
    action={<Button size="sm">Ver todas</Button>}
  />
  {items.length === 0 ? (
    <EmptyDataState title="Nenhuma empresa cadastrada" />
  ) : (
    children
  )}
</Surface>
```

```tsx
<MetricCard
  label="Colaboradores"
  value={total.toLocaleString(locale)}
  helper="Ativos na plataforma"
  icon={<Users size={14} />}
  accent="#2ecc71"
/>
```

## Accessibility

- Loading buttons set `aria-busy` and disable repeated submissions.
- Loading blocks use `role="status"` and `aria-live="polite"`.
- Error blocks use `role="alert"`.
- Decorative icons are hidden from assistive tech.
- Components keep stable dimensions to avoid layout shifts.
