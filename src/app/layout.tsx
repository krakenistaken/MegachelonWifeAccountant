import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Ön Muhasebe & Yönetim Paneli',
  description: 'Gelir ve gider işlemlerinizi kolayca yönetin. Gerçek zamanlı eşitleme, çoklu kasa ve para birimi desteği.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
