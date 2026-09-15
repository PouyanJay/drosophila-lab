'use client';
import { useRef } from 'react';
import './composer-menu.css';

// Both pickers use the composer as their anchor, not the individual toolbar chip.
export function useComposerAnchor() {
  const trigger = useRef<HTMLButtonElement>(null);
  const anchor = useRef({
    getBoundingClientRect: () => {
      const element = trigger.current?.closest('.da-composer') || trigger.current;
      return element?.getBoundingClientRect() || new DOMRect();
    },
  });
  return { trigger, anchor };
}
