'use client';
import React from 'react';

/**
 * Tabs acessível (WAI-ARIA Tabs pattern), controlado.
 *
 *   <Tabs value={tab} onValueChange={setTab} label="Seções da empresa">
 *     <TabList>
 *       <Tab value="visao">Visão geral</Tab>
 *       <Tab value="cargos" badge="F0">Cargos & Comp.</Tab>
 *     </TabList>
 *     <TabPanel value="visao"><Visao/></TabPanel>
 *     <TabPanel value="cargos"><Cargos/></TabPanel>
 *   </Tabs>
 *
 * - role=tablist/tab/tabpanel, aria-selected, aria-controls, aria-labelledby
 * - roving tabindex (só a aba ativa é tabbable)
 * - setas ←/→/↑/↓ navegam e ativam (activation automática), Home/End vão às pontas
 * - TabPanel só monta quando ativo (mantém o padrão de render condicional do app)
 */
const TabsCtx = React.createContext(null);

export function Tabs({ value, onValueChange, label, children, style }) {
  const baseId = React.useId();
  const ctx = React.useMemo(
    () => ({ value, setValue: onValueChange, baseId, label }),
    [value, onValueChange, baseId, label]
  );
  return (
    <TabsCtx.Provider value={ctx}>
      <div style={style}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabList({ children, className = '' }) {
  const { label } = React.useContext(TabsCtx);
  const ref = React.useRef(null);

  function onKeyDown(e) {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const tabs = Array.from(ref.current?.querySelectorAll('[role="tab"]:not([aria-disabled="true"])') || []);
    if (!tabs.length) return;
    const current = tabs.indexOf(document.activeElement);
    let next = current;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (current - 1 + tabs.length) % tabs.length;
    if (next !== current && tabs[next]) {
      e.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    }
  }

  return (
    <div ref={ref} role="tablist" aria-label={label} className={`ds-tablist ${className}`.trim()} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

export function Tab({ value, badge, disabled = false, children }) {
  const { value: active, setValue, baseId } = React.useContext(TabsCtx);
  const selected = active === value;
  return (
    <button
      role="tab"
      type="button"
      id={`${baseId}-tab-${value}`}
      className="ds-tab"
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      aria-disabled={disabled || undefined}
      tabIndex={selected ? 0 : -1}
      onClick={() => !disabled && setValue(value)}
    >
      {children}
      {badge && <sup className="ds-tab__sup">{badge}</sup>}
    </button>
  );
}

export function TabPanel({ value, children, style }) {
  const { value: active, baseId } = React.useContext(TabsCtx);
  if (active !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      style={{ outline: 'none', marginTop: 20, ...style }}
    >
      {children}
    </div>
  );
}
