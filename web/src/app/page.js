export default function HomePage() {
  return (
    <main className="container">
      <section className="card overflow-hidden p-0">
        <div className="grid gap-8 bg-gradient-to-r from-white via-accent-50 to-white px-6 py-10 md:grid-cols-[1.1fr_0.9fr] md:px-10">
          <div>
            <p className="mb-3 inline-block rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent-800">
              Hospital First Onboarding
            </p>
            <h1 className="mb-4 text-4xl font-semibold leading-tight tracking-tight text-slate-900">
              Request Hospital Onboarding, Then Manage Everything From One Portal
            </h1>
            <p className="max-w-xl text-sm text-slate-600 sm:text-base">
              Hospital admins do not wait for admin data-entry. Submit your hospital details directly, get reviewed by
              platform admin, receive approval or disapproval email, and sign in to create departments and onboard doctors.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/hospital-onboarding" className="rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-700">
                Sign Up Hospital
              </a>
              <a href="/hospital-portal" className="rounded-xl border border-accent-200 bg-white px-5 py-2.5 text-sm font-semibold text-accent-700 hover:bg-accent-50">
                Sign In Hospital Portal
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">How It Works</h2>
            <ol className="space-y-3 text-sm text-slate-600">
              <li><span className="font-semibold text-slate-800">1.</span> Hospital admin submits onboarding request.</li>
              <li><span className="font-semibold text-slate-800">2.</span> Platform admin approves or disapproves request.</li>
              <li><span className="font-semibold text-slate-800">3.</span> Email is sent for both outcomes.</li>
              <li><span className="font-semibold text-slate-800">4.</span> On approval, login credentials are shared by email.</li>
              <li><span className="font-semibold text-slate-800">5.</span> Hospital can sign in, create departments, and add doctors.</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <a href="/hospital-onboarding" className="card transition hover:border-accent-200">
          <h3 className="mb-2 text-lg font-semibold text-slate-900">Hospital Sign Up</h3>
          <p className="text-sm text-slate-600">Submit onboarding request with basic hospital and contact details.</p>
        </a>
        <a href="/hospital-portal" className="card transition hover:border-accent-200">
          <h3 className="mb-2 text-lg font-semibold text-slate-900">Hospital Sign In</h3>
          <p className="text-sm text-slate-600">Use approved credentials to manage departments and doctors.</p>
        </a>
        <a href="/hospital-onboarding/admin-review" className="card transition hover:border-accent-200">
          <h3 className="mb-2 text-lg font-semibold text-slate-900">Admin Request Review</h3>
          <p className="text-sm text-slate-600">Admin view to approve or disapprove onboarding requests.</p>
        </a>
      </section>

      <section className="mt-4">
        <a href="/doctor-signin" className="card block transition hover:border-accent-200">
          <h3 className="mb-2 text-lg font-semibold text-slate-900">Doctor Sign In</h3>
          <p className="text-sm text-slate-600">Access triage queue, urgent alerts, appointments, and patient context in one focused portal.</p>
        </a>
      </section>
    </main>
  );
}
