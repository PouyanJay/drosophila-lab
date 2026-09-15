'use client';
import { useEffect } from 'react';

/** Show scroll activity and release every listener and timer on unmount. */
export function useScrollActivity() {
  useEffect(() => {
    const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    const onScroll = (event: Event) => {
      const element = event.target;
      if (
        !(element instanceof HTMLElement) ||
        !element.closest('.uw-studio,.da-sheet,.da-dialog,.da-model-popover')
      )
        return;
      element.classList.add('uw-scrolling');
      clearTimeout(timers.get(element));
      timers.set(
        element,
        setTimeout(() => {
          element.classList.remove('uw-scrolling');
          timers.delete(element);
        }, 800),
      );
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      timers.forEach((timer, element) => {
        clearTimeout(timer);
        element.classList.remove('uw-scrolling');
      });
    };
  }, []);
}
