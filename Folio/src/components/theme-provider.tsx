"use client";

import { ThemeProvider as NextThemes } from "next-themes";

// Wraps next-themes; class-based so it drives the .dark tokens in globals.css.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
