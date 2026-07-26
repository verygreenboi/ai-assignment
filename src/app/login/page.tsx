import { signIn } from "./actions";

/**
 * The login page — spec §2.6.
 *
 * The seeded accounts are hardcoded on purpose: this page prerenders at build
 * time, and querying the database here would make `next build` require a live
 * Postgres. The emails still have to exist in the database for `signIn` to
 * succeed, so this list is a menu, not an authority.
 */
const SEEDED_ACCOUNTS = [
  { email: "ada@ajaia.test", name: "Ada Lovelace" },
  { email: "grace@ajaia.test", name: "Grace Hopper" },
  { email: "alan@ajaia.test", name: "Alan Turing" },
];

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Collab Docs</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Demo mode — pick a seeded account, no password required.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {SEEDED_ACCOUNTS.map((account) => (
          <li key={account.email}>
            <form action={signIn}>
              <input type="hidden" name="email" value={account.email} />
              {/*
                The accessible name of this button must contain the email —
                `e2e/helpers/auth.ts` finds the card with
                getByRole('button', { name: '<email>' }).
              */}
              <button
                type="submit"
                className="flex w-full flex-col items-start gap-1 rounded-lg border border-neutral-300 p-4 text-left hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                <span className="font-medium">{account.name}</span>
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  {account.email}
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
