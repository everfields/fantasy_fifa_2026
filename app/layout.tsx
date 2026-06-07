import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mundial 2026 Pool",
  description: "Prediction pool for the FIFA World Cup 2026",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">{children}</body>
    </html>
  );
}
