import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import "./globals.css";

// One family in two moods: a rounded display face and a humanist text face, calmer weights for staff, bolder for children.
const baloo = Baloo_2({ variable: "--font-baloo", subsets: ["latin"], display: "swap", weight: ["600", "700", "800"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], display: "swap", weight: ["400", "600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Lesson Plan", template: "%s · Lesson Plan" },
  description: "Lessons, in order, for every class in your school.",
};

export const viewport: Viewport = { themeColor: "#2a1f3d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${baloo.variable} ${nunito.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
