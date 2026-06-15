import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrintAI Planner — AI Production Planning",
  description: "AI-powered production planning assistant for printing industries",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 antialiased">
        {children}
      </body>
    </html>
  );
}
