'use client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Children, cloneElement, isValidElement, useEffect, useId, useState } from 'react';
export function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: any;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="fs-field">
      <label htmlFor={id}>
        {label}
        {value !== undefined && <b>{value}</b>}
      </label>
      {isValidElement(children) ? cloneElement(children as any, { id }) : children}
    </div>
  );
}

export function Choice({
  children,
  value,
  onChange,
  ...rest
}: {
  children: React.ReactNode;
  value: string | number;
  onChange: (e: { target: { value: string } }) => void;
  id?: string;
  'aria-label'?: string;
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange({ target: { value: v } })}>
      <SelectTrigger className="fs-choice" id={rest.id} aria-label={rest['aria-label']}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="fs-select-popover">
        {Children.toArray(children).flatMap((child: any) =>
          child?.type === 'option'
            ? [
                <SelectItem key={String(child.props.value)} value={String(child.props.value)}>
                  {child.props.children}
                </SelectItem>,
              ]
            : [],
        )}
      </SelectContent>
    </Select>
  );
}

export function NumericInput({
  value,
  onCommit,
  min,
  max,
  step,
  id,
  ...rest
}: {
  value: number;
  onCommit: (v: number) => void;
  min: number;
  max: number;
  step: number;
  id?: string;
  'aria-label'?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      {...rest}
      id={id}
      type="number"
      inputMode={step === 1 ? 'numeric' : 'decimal'}
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      onBlur={() => {
        const n = Number(draft),
          bounded = draft.trim() && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : value,
          v = step === 1 ? Math.floor(bounded) : bounded;
        setDraft(String(v));
        onCommit(v);
      }}
    />
  );
}
