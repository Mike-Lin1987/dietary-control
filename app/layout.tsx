import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NutriLens 飲食控制",
  description: "使用 AI 協助記錄餐點與營養攝取。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/legacy/css/style.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
