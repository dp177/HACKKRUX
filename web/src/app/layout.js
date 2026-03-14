import './globals.css';
import { Inter } from 'next/font/google';
import { AppToaster } from '../components/ui/sonner';

const primaryFont = Inter({
  subsets: ['latin'],
  variable: '--font-primary'
});

export const metadata = {
  title: 'Jeeva — AI-Powered Clinical Triage & Decision Support',
  description: 'Helping hospitals prioritize patients, assist doctors with intelligent triage, and streamline medical workflows.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={primaryFont.variable} suppressHydrationWarning>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
