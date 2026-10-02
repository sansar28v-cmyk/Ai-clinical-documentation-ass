import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Clinical Documentation Assistant — Chart Less. Care More.",
  description:
    "Upload a doctor-patient consultation recording and let AI transcribe it, extract a structured clinical note, and hand it back for your review in minutes.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Inter (UI font) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />

        {/* BubbledotICG-FinePos (retro dot-matrix display font) */}
        <link
          href="https://db.onlinewebfonts.com/c/8cb707a9b8a73f8a7403336b861c3074?family=BubbledotICG-FinePos"
          rel="stylesheet"
        />

        {/* Font Awesome 6.5.2 (enterprise brand icons) */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
          integrity="sha512-SnH5WK+bZxgPHs44uWIX+LLJAJ9/2PkPKZ5QiAj6Ta86w+fsb2TkcmfRyVX3pBnMFcV7oQPJkl9QevSCWr3W6A=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />

        {/* Static page styles */}
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        {children}
        {/* beforeInteractive loads this self-hosted script before any app code,
            guaranteeing the mobile menu + stats count-up work on first paint. */}
        <Script src="/main.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}
