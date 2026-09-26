import type { Metadata } from "next";
import "./globals.css";

// Nonces require fresh server rendering, including public auth pages.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Project Atlas",
  description: "Multi-tenant recruiting CRM for real estate talent"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

