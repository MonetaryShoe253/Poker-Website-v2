export function PlaceholderPage({ title, notFound = false }: { title: string; notFound?: boolean }) {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-semibold tracking-[0.12em]">{title}</h1>
      <p className="text-muted">
        {notFound
          ? "This page folded before the flop. Check the address, or head back to the lobby."
          : "Coming soon — this table is still being felted."}
      </p>
    </section>
  );
}
