<!-- orch:begin -->
## AI Orchestration (Agents)

- You may be invoked by an orchestrator; the role and output schema then come from the prompt.
- Project rules: `.ai/context/project.md` and `.ai/context/conventions.md`. Read `.ai/context/architecture.md` only when layer boundaries matter.
- Commit messages use an English lowercase type and scope with a Turkish description, for example `feat(products): Ürün listesi yenileme eklendi.`
- Never edit `.ai/`.
- Never commit, push or merge; the orchestrator does it.
- Never deploy.
- Never read or print secrets: `.env*`, keystores, `key.properties`, service account files.
<!-- orch:end -->
