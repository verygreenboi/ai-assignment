import { redirect } from "next/navigation";

import { readSession } from "@/lib/session";

import { signOut } from "./actions";

/**
 * Placeholder dashboard. Child #4 replaces the body of this page, but the
 * signed-in user's NAME and the LOGOUT control must survive that rewrite —
 * `e2e/auth.spec.ts` asserts on both permanently.
 *
 * `src/proxy.ts` already turns anonymous requests away; the redirect below is
 * the belt to its braces, and it narrows the type.
 */
export default async function DocumentsPage() {
  const user = await readSession();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Signed in as {user.name}
          </p>
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Log out
          </button>
        </form>
      </header>
    </main>
  );
}
