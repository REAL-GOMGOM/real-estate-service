'use client';

import { useEffect, useRef } from 'react';

export function usePreserveFormDraft() {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    // Resolved Server Actions reset native fields even for an expected error.
    // A native listener also works during React's commit-time reset, when
    // delegated onReset handlers are suppressed. Success replaces the draft UI.
    function preserveDraft(event: Event) { event.preventDefault(); }
    form.addEventListener('reset', preserveDraft);
    return () => form.removeEventListener('reset', preserveDraft);
  }, []);
  return formRef;
}
