import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeRush — Swallow hours of editing in seconds",
  description:
    "DeRush is the AI-powered video-editing assistant that learns how you cut, turns raw transcripts into a pre-edited timeline, and gets sharper with every video you finish.",
};

// Applied before React hydrates so the page paints in the correct theme right
// away (avoids a flash of the wrong theme). Mirrors ThemeProvider's logic.
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("derush-theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    var root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        </head>
        <body className="min-h-screen bg-background text-foreground antialiased">
          <ThemeProvider>
            <ConvexClientProvider>{children}</ConvexClientProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
