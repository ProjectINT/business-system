import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MobileNav, Sidebar } from "@/components/shell/sidebar";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Villa Portfolio — Finance",
  description: "Villa portfolio finance dashboard: data intake, data quality and aggregated metrics",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      data-theme="dark"
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <MobileNav />
              <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
