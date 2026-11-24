

function Documents() {
  return (
    <>
      <main className="min-h-screen bg-[#0B1120] p-5 text-slate-100 md:p-8">

        <header className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-blue-400">
            Workspace
          </p>

          <h1 className="text-3xl font-bold text-white md:text-4xl">
            Documents
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Access project documents and shared files.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-700/70 bg-[#111C32] p-8 text-center">

          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-2xl text-blue-400">
            ▤
          </div>

          <h2 className="text-lg font-semibold text-white">
            Document Management
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            The document access page is ready for integration.
            Project-specific documents will be displayed here
            once the document storage structure and permissions
            are connected.
          </p>

        </section>

      </main>
    </>
  );
}

export default Documents;
