import './globals.css';
import { Inter } from 'next/font/google';
import { AppToaster } from '../components/ui/sonner';

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
    <html lang="en" suppressHydrationWarning>
      <body className={primaryFont.variable}>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
