/* Developer overlay - pathway steps with boundary badges, spec-correct API
 * traffic, staged prompts, the hash-chained run record, reproducibility
 * checks, and the outcome-signal / longitudinal view. */

"use strict";

const DevOverlay = {
  enabled: false,
  tab: "steps",
  tabs: [
    ["steps", "Pathway steps"],
    ["api", "Chipotle API"],
    ["record", "Run record"],
    ["prompts", "Staged prompts"],
    ["action", "Compiled action"],
    ["outcomes", "Outcome signals"],
  ],

  init() {
    const sw = document.getElementById("devSwitch");
    sw.addEventListener("click", () => {
      this.enabled = !this.enabled;
      sw.classList.toggle("on", this.enabled);
      sw.setAttribute("aria-checked", String(this.enabled));
      document.getElementById("devPanel").classList.toggle("hidden", !this.enabled);
      this.render();
    });
    const tabsEl = document.getElementById("devTabs");
    tabsEl.innerHTML = this.tabs.map(([id, label]) =>
      `<button class="dev-tab" data-tab="${id}">${label}</button>`).join("");
    tabsEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]");
      if (!b) return;
      this.tab = b.dataset.tab;
      this.render();
    });
    document.addEventListener("chipotle-call", () => this.enabled && this.tab === "api" && this.render());
    document.addEventListener("run-record-append", () => this.enabled && (this.tab === "record" || this.tab === "steps") && this.render());
    document.addEventListener("app-state-change", () => this.enabled && this.render());
  },

  badge(cls) {
    if (cls === "deterministic") return `<span class="badge det">deterministic</span>`;
    if (cls === "boundary-crossing") return `<span class="badge cross">boundary-crossing</span>`;
    return `<span class="badge syn">synthesis</span>`;
  },

  render() {
    if (!this.enabled) return;
    document.getElementById("devCid").textContent = App.state.compiledCid || " - ";
    document.querySelectorAll(".dev-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === this.tab));
    const body = document.getElementById("devBody");
    const fn = { steps: this.renderSteps, api: this.renderApi, record: this.renderRecord,
                 prompts: this.renderPrompts, action: this.renderAction, outcomes: this.renderOutcomes }[this.tab];
    body.innerHTML = fn.call(this);
  },

  renderSteps() {
    const rows = App.stepLedger.map((s) => `
      <tr>
        <td><code>${s.order}</code></td>
        <td>${s.skill}<br><span class="kv">${s.phase}</span></td>
        <td>${this.badge(s.boundary_class)}</td>
        <td>${s.status === "done"
            ? (s.boundary_class === "deterministic"
                ? `<span class="badge ok">replay-verified ✓</span>`
                : (s.adopted === undefined ? `<span class="badge warn">advisory</span>`
                   : s.adopted ? `<span class="badge ok">adopted by neutral</span>`
                               : `<span class="badge bad">rejected by neutral</span>`))
            : `<span class="kv">${s.status}</span>`}</td>
      </tr>`).join("");
    return `<p class="kv">Every step declares a ZTP <b>boundary_class</b>. Deterministic steps re-execute
      from hashed inputs and must match byte-for-byte (reproducibility signatures); synthesis output is
      advisory until a recorded human act adopts it.</p>
      <table class="tbl"><tr><th>#</th><th>step</th><th>class</th><th>status</th></tr>${rows}</table>`;
  },

  renderApi() {
    if (!ChipotleTransport.log.length)
      return `<p class="kv">No calls yet. Every Chipotle request is built to the published REST spec
        (base <code>${CHIPOTLE_BASE}</code>) and answered locally in stub mode.</p>`;
    return ChipotleTransport.log.slice().reverse().map((e) => `
      <details class="api-entry">
        <summary><span class="api-method">${e.request.method}</span>
          <code>${e.request.url.replace(CHIPOTLE_BASE, "")}</code>
          <span class="kv">${e.meta.label ?? ""}</span>
          <span class="api-status-ok">${e.stubbed ? "stubbed 200" : "live"}</span></summary>
        <pre>// request\n${JSON.stringify(e.request, null, 2)}</pre>
        <pre>// response\n${JSON.stringify(e.response, null, 2)}</pre>
      </details>`).join("");
  },

  renderRecord() {
    const rows = RunRecord.revisions.slice().reverse().map((r) => `
      <tr><td><code>${r.revision_hash.slice(0, 12)}…</code></td>
          <td>${r.kind}</td>
          <td>${this.badge(r.boundary_class)}</td>
          <td><code>${r.prev === "GENESIS" ? "GENESIS" : r.prev.slice(0, 10) + "…"}</code></td></tr>`).join("");
    return `<p class="kv">Append-only, hash-chained run record (Aqua-shaped). Root:
      <code>${RunRecord.root().slice(0, 16)}…</code></p>
      <table class="tbl"><tr><th>revision</th><th>kind</th><th>class</th><th>prev</th></tr>${rows}</table>`;
  },

  renderPrompts() {
    const entries = [...StagedPrompts.store.entries()];
    if (!entries.length) return `<p class="kv">No staged prompts yet. Synthesis slots can only consume a
      prompt whose <code>content_sha256</code> was recorded by a deterministic StagePrompt step.</p>`;
    return entries.map(([path, e]) => `
      <details class="api-entry"><summary><code>${e.slot}</code> <span class="kv">${path.slice(0, 52)}…</span></summary>
      <pre>sha256: ${e.content_sha256}\n\n${e.text}</pre></details>`).join("");
  },

  renderAction() {
    return `<p class="kv">Excerpt of the action source that <code>Lit.Pathway.CompileAction@v1</code> would
      pin to IPFS. Policy registers are compiled constants - part of the CID, hence part of the signer.
      Note: no model client is reachable from any deterministic branch.</p>
      <pre>${COMPILED_ACTION_PREVIEW.replace(/</g, "&lt;")}</pre>
      <button class="btn ghost small" onclick="App.replayCheck()">Run reproducibility check (re-execute ZOPA, compare hashes)</button>
      <div id="replayResult"></div>`;
  },

  renderOutcomes() {
    const sig = buildOutcomeSignal(App.state);
    const prior = SCENARIO.outcomeLedgerPrior.map((v) => `
      <tr><td class="kv">${v.variant}</td><td>${v.n}</td><td>${Math.round(v.accord_rate * 100)}%</td>
      <td>${v.median_rounds}</td><td>${v.median_duration_days}d</td><td>${Math.round(v.compliance_confirmed_rate * 100)}%</td></tr>`).join("");
    return `<p class="kv">Per-run <b>outcome signal</b> (process-shaped; no PII, no positions, no AI-quality
      scores) - feeds <code>Lit.Negotiation.ProtocolOutcomeLedger@v1</code> for longitudinal study of
      procedural variants (operationalizes EXP-LCP-4 / EXP-LCP-5).</p>
      <pre>${JSON.stringify(sig, null, 2)}</pre>
      <p class="kv"><b>Prior aggregated cells</b> (simulated commons, same dispute category):</p>
      <table class="tbl"><tr><th>variant</th><th>n</th><th>accord</th><th>med. rounds</th><th>med. days</th><th>compliance</th></tr>${prior}</table>
      <p class="kv">Fork lineage attached per cell; cells under n=5 suppressed; causal claims are
      human-only and pre-registered (<code>non_delegable_acts: [publish_causal_claim]</code>).</p>`;
  },
};
