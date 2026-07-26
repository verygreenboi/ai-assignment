import Link from "next/link";

import { appName } from "@/lib/app-info";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-4 px-16 py-32">
        <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
          {appName()}
        </h1>
        <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          A collaborative document editor. This build is in progress.
        </p>
        <div>
          <Link
            href="/login"
            className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-base font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
