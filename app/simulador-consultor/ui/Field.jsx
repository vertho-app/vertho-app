'use client';
import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Field — wrapper de formulário acessível. Associa <label> ao controle via id,
 * e expõe hint/erro por aria-describedby. Use o render-prop para receber os ids:
 *
 *   <Field label="Nome" hint="..." error={err}>
 *     {(props) => <input className="ds-input" {...props} />}
 *   </Field>
 *
 * Ou prefira os atalhos TextField / SelectField abaixo.
 */
export function Field({ label, hint, error, required, children, htmlFor }) {
  const autoId = React.useId();
  const id = htmlFor || autoId;
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint && hintId, error && errId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="ds-field">
      {label && (
        <label className="ds-label" htmlFor={id}>
          {label}{required && <span className="ds-label__req" aria-hidden="true">*</span>}
        </label>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, 'aria-required': required || undefined })}
      {hint && !error && <span id={hintId} className="ds-hint">{hint}</span>}
      {error && (
        <span id={errId} className="ds-error" role="alert">
          <AlertCircle size={13} aria-hidden="true" /> {error}
        </span>
      )}
    </div>
  );
}

export const TextField = React.forwardRef(function TextField(
  { label, hint, error, required, icon: Icon, htmlFor, className = '', ...rest }, ref
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={htmlFor}>
      {(a11y) =>
        Icon ? (
          <div style={{ position: 'relative' }}>
            <Icon size={15} aria-hidden="true" style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ds-faint)' }} />
            <input ref={ref} className={`ds-input ${className}`.trim()} style={{ paddingLeft: 34 }} {...a11y} {...rest} />
          </div>
        ) : (
          <input ref={ref} className={`ds-input ${className}`.trim()} {...a11y} {...rest} />
        )
      }
    </Field>
  );
});

export const SelectField = React.forwardRef(function SelectField(
  { label, hint, error, required, htmlFor, children, className = '', ...rest }, ref
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={htmlFor}>
      {(a11y) => (
        <select ref={ref} className={`ds-input ${className}`.trim()} {...a11y} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
});
