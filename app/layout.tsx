import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "探店参谋",
  description: "说出你想怎么吃，从评价里找出该去哪家",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${notoSansSC.variable} ${geistSans.variable} ${geistMono.variable} h-full w-full max-w-full overflow-x-hidden antialiased`}
    >
      <body className="flex min-h-full min-h-dvh w-full min-w-0 max-w-full flex-col overflow-x-hidden font-sans">
        {children}
      </body>
    </html>
  );
}
