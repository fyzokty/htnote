(async () => {
  const record = (name, passed) => {
    document.documentElement.dataset[name] = passed ? "pass" : "fail";
  };

  try {
    void window.parent.document;
    record("parentDocument", false);
  } catch {
    record("parentDocument", true);
  }

  let parentInternals;
  try {
    parentInternals = window.parent.__TAURI_INTERNALS__;
  } catch {
    parentInternals = undefined;
  }
  const ownInternals = window.__TAURI_INTERNALS__;
  record("internals", parentInternals === undefined);
  document.documentElement.dataset.ownInternals = ownInternals === undefined ? "absent" : "present";

  const commands = [
    ["get_settings", undefined],
    ["plugin:opener|open_url", { url: "https://example.com" }],
    ["plugin:event|listen", { event: "fs-change" }],
  ];
  const invokeResults = await Promise.all(commands.map(async ([command, args]) => {
    if (typeof ownInternals?.invoke !== "function") return true;
    try {
      await ownInternals.invoke(command, args);
      return false;
    } catch {
      return true;
    }
  }));
  record("invoke", invokeResults.every(Boolean));

  const hostUrl = (() => {
    try { return window.top.location.href; } catch { return null; }
  })();
  try {
    window.top.location = "https://example.com";
    record("topNavigation", hostUrl === null || window.top.location.href === hostUrl);
  } catch {
    record("topNavigation", true);
  }

  try {
    record("popup", window.open("https://example.com") === null);
  } catch {
    record("popup", true);
  }

  const id = "3f6c2a9e-8b1d-4c57-9e0a-2d4b7f1c5e88";
  const paths = [`/${id}/../../`, `/${id}/%2e%2e/%2e%2e/`, `/${id}/%252e%252e/%252e%252e/`];
  const results = await Promise.all(paths.map(async (path) => {
    try {
      const response = await fetch(`${location.origin}${path}`);
      return response.status === 403 || response.status === 404;
    } catch {
      return true;
    }
  }));
  record("traversal", results.every(Boolean));

  try {
    const response = await fetch("http://ipc.localhost/get_settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const body = await response.text();
    record("ipcFetch", !response.ok || !body.includes("rootDir"));
  } catch {
    record("ipcFetch", true);
  }

  document.documentElement.dataset.done = "true";
  document.title = "Isolation complete";
})();
