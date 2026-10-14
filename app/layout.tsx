import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Axis | Psicólogos en Colombia",
  description: "Agenda, pacientes, consultorios y pagos de Psicólogos en Colombia.",
};

import { Toaster } from "@/components/ui/sonner";
import { HalloweenProvider } from "@/components/seasonal/halloween-provider";
import { ChristmasProvider } from "@/components/seasonal/christmas-provider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <HalloweenProvider><ChristmasProvider>{children}</ChristmasProvider></HalloweenProvider>
        <Toaster />
      </body>
    </html>
  );
}
