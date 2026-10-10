import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "CMkatana",
  description: "Turn any motion-graphics video into an editable template: exact motion, your assets.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <header className="topbar">
            <Link href="/" className="brand">
              CM<span>katana</span>
            </Link>
            <span className="muted small">motion graphics → Claude motion prompt → your video</span>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
