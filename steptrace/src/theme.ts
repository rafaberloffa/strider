import { webDarkTheme, webLightTheme, Theme } from '@fluentui/react-components';

export function getTheme(): Theme {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? webDarkTheme : webLightTheme;
}
