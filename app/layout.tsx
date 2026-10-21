import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "차팅 서포트",
  description: "시술 견적 자동 계산 및 차팅 텍스트 생성",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        {/* 화면에는 보이지 않지만 페이지 소스에 남는 저작권 표기 (메인·상세설정 공통) */}
        <footer hidden style={{ textAlign: "center" }}>
          COPYRIGHT © EUNBIN GA. Developed and planned by EUNBIN GA.
        </footer>
      </body>
    </html>
  );
}
