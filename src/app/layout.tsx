import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, DM_Sans, EB_Garamond, Geist_Mono } from "next/font/google";
import { MotionProvider } from "@/components/motion";
import "./globals.css";

// The main site's fonts: Cormorant Garamond for headings, EB Garamond for lesson
// reading text, DM Sans for the interface.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-eb-garamond",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"),
  title: {
    default: "Oakvale Learning",
    template: "%s | Oakvale Learning",
  },
  description: "Self-paced, certified caregiving courses from Oakvale Learning.",
  appleWebApp: { capable: true, title: "Oakvale", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#145c3f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} ${cormorant.variable} ${ebGaramond.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
