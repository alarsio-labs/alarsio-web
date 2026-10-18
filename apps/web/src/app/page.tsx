import { APP_ROLES } from "@alarsio/types";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Alarsio</h1>
      <p className="mt-2 text-neutral-600">
        Dashboard shell. Roles: {APP_ROLES.join(", ")}.
      </p>
    </main>
  );
}
