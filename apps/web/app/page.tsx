import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <p className="text-sm font-semibold uppercase tracking-widest">Papert</p>
      <h1 className="text-4xl font-semibold">Learn by building.</h1>
      <p>
        Build your development skills with a private study space and Seymour,
        your AI tutor.
      </p>
      <Link className="auth-button w-fit" href="/account">
        Sign in or create an account
      </Link>
    </main>
  );
}
