import './globals.css';
import { Inter } from 'next/font/google';

const primaryFont = Inter({
  subsets: ['latin'],
  variable: '--font-primary'
});

export const metadata = {
  title: 'Triage Platform',
  description: 'Hospital onboarding, portal operations, and doctor workflow tools'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={primaryFont.variable}>{children}</body>
    </html>
  );
}
