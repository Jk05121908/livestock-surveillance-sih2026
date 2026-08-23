import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/language-context";
import Header from "@/components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Livestock Surveillance — SIH 2026",
  description: "Mobile-friendly livestock disease reporting with offline support",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-black">
        <LanguageProvider>
          <Header />
          <div className="flex-1 flex flex-col">{children}</div>
          <footer className="text-center text-xs text-zinc-500 dark:text-zinc-400 py-4 px-4">
            SIH 2026 • Livestock Surveillance • Offline-ready
          </footer>
        </LanguageProvider>
      </body>
    </html>
  );
}
