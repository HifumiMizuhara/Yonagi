import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialogAccessibility(
  dialogRef: RefObject<HTMLElement | null>,
  onClose?: () => void,
  active = true
) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
    const focusable = getFocusable();
    const initialFocus = focusable[0] || dialog;
    initialFocus.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      const modalDialogs = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]'))
        .filter((element) => element.getClientRects().length > 0);
      if (modalDialogs[modalDialogs.length - 1] !== dialog) return;

      if (event.key === 'Escape' && onCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const currentFocusable = getFocusable();
      if (currentFocusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [active, dialogRef]);
}
