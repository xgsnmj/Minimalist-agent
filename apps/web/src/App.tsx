import { FormEvent, useState } from "react";


export function App() {
  const [mode, setMode] = useState<"intro" | "register" | "pending">("intro");

  function requestAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMode("pending");
  }

  return (
    <main className="app-shell">
      <section className="app-panel" aria-labelledby="app-title">
        <p className="eyebrow">Agent Platform</p>
        <h1 id="app-title">Minimalist Agent</h1>
        {mode === "intro" ? (
          <div className="stack">
            <p>Agent Platform scaffold is running.</p>
            <button className="primary-button" type="button" onClick={() => setMode("register")}>
              Create Local Account
            </button>
          </div>
        ) : null}
        {mode === "register" ? (
          <form className="stack" onSubmit={requestAccess}>
            <label>
              <span>Username</span>
              <input name="username" required />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" required />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" minLength={8} required />
            </label>
            <button className="primary-button" type="submit">
              Request Access
            </button>
          </form>
        ) : null}
        {mode === "pending" ? (
          <div className="stack">
            <h2>Account pending approval</h2>
            <p>An Administrator needs to approve this Local Account before workspace access is available.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
