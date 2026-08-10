import type { Metadata, Viewport } from "next";
import { Oswald, Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "./components/NavBar";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const robotoMono = Roboto_Mono({ subsets: ["latin"], variable: "--font-data" });

export const metadata: Metadata = {
  title: "CFBPools.com",
  description: "SEC Survivor Pool & Weekly College Football Pick'em",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable} ${robotoMono.variable}`}>
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
