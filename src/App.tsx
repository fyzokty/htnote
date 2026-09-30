import { NotebookPen } from "lucide-react";

function App() {
  return (
    <main className="flex h-screen items-center justify-center bg-slate-900 text-slate-100">
      <div className="flex items-center gap-3">
        <NotebookPen className="size-8 text-indigo-500" aria-hidden />
        <h1 className="text-3xl font-semibold tracking-tight">HTNote</h1>
      </div>
    </main>
  );
}

export default App;
