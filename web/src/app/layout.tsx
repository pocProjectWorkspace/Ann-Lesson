import type { Metadata, Viewport } from "next";
import { Manrope, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });
const serif = Source_Serif_4({ variable: "--font-serif", subsets: ["latin"], display: "swap", weight: ["400", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Lesson Plan", template: "%s · Lesson Plan" },
  description: "Lessons, in order, for every class in your school.",
};

export const viewport: Viewport = { themeColor: "#0e1626" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${serif.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
