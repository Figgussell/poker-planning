import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poker Planning",
  description: "Private team voting and shared story estimates.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
