import { updatePassword } from "@/app/actions/auth";
import PasswordInput from "@/app/components/PasswordInput";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm sm:max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">Set a new password</h1>
      <p className="mb-6 text-sm text-muted">Choose a new password for your account.</p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">
          {params.error}
        </p>
      )}

      <form action={updatePassword} className="flex flex-col gap-4">
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink">
            New password
          </label>
          <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
        </div>
        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-1 block text-sm font-medium text-ink"
          >
            Confirm new password
          </label>
          <PasswordInput id="confirmPassword" name="confirmPassword" required minLength={8} autoComplete="new-password" />
        </div>
        <button
          type="submit"
          className="mt-2 rounded-md bg-gold-500 px-4 py-2.5 text-base font-semibold text-app transition hover:bg-gold-600"
        >
          Update password
        </button>
      </form>
    </main>
  );
}
