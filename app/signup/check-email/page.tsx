export default function CheckEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-bold text-brand-700">Check your email</h1>
      <p className="text-slate-600">
        We sent you a confirmation link. Click it to activate your account, then come back and
        log in.
      </p>
      <p className="text-sm text-slate-500">
        Don&apos;t see it? Check your spam folder — and if it&apos;s not there either, reach out
        so we can help.
      </p>
    </main>
  );
}
