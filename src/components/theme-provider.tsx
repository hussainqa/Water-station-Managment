"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Light / Dark / System. Adds the `dark` class to <html>; tokens live in globals.css. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
