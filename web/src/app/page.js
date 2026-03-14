import Navbar from '../components/landing/Navbar';
import HeroSection from '../components/landing/HeroSection';
import PlatformOverview from '../components/landing/PlatformOverview';
import CoreFeatures from '../components/landing/CoreFeatures';
import HowItWorks from '../components/landing/HowItWorks';
import DoctorPreview from '../components/landing/DoctorPreview';
import CTASection from '../components/landing/CTASection';
import Footer from '../components/landing/Footer';

export const metadata = {
  title: 'Jeeva — AI-Powered Clinical Triage & Decision Support',
  description:
    'Helping hospitals prioritize patients, assist doctors with intelligent triage, and streamline medical workflows.',
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main>
        <HeroSection />
        <PlatformOverview />
        <CoreFeatures />
        <DoctorPreview />
        <HowItWorks />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
