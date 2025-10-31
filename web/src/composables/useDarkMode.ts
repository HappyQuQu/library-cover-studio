import { useDark, useToggle } from '@vueuse/core';

export const isDark = useDark({
  storageKey: 'theme-mode',
});

export const toggleDark = useToggle(isDark);
