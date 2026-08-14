"use client";

export default function ConfirmEmailInput({ id, name }: { id: string; name: string }) {
  return (
    <input
      id={id}
      name={name}
      type="email"
      required
      autoComplete="email"
      onPaste={(e) => e.preventDefault()}
      className="w-full rounded-md border border-edge bg-app px-3 py-2 text-base text-ink focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
    />
  );
}
