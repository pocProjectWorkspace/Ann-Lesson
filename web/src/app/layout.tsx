import type { Metadata, Viewport } from "next";
import { Baloo_2, Manrope, Nunito, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });
const serif = Source_Serif_4({ variable: "--font-serif", subsets: ["latin"], display: "swap", weight: ["400", "600", "700"] });
// The child world: a rounded display face and a humanist text face, one family in two moods.
const baloo = Baloo_2({ variable: "--font-baloo", subsets: ["latin"], display: "swap", weight: ["600", "700", "800"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], display: "swap", weight: ["400", "600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Lesson Plan", template: "%s · Lesson Plan" },
  description: "Lessons, in order, for every class in your school.",
};

export const viewport: Viewport = { themeColor: "#0e1626" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${serif.variable} ${baloo.variable} ${nunito.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
