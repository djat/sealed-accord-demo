/* Lit Chipotle API transport - spec-correct requests, local stub responses.
 *
 * Every call this app would make in production is constructed EXACTLY to the
 * published Chipotle REST spec (https://developer.litprotocol.com/):
 *
 *   base:  https://api.chipotle.litprotocol.com
 *   POST /core/v1/new_account        {account_name, account_description} -> {api_key, wallet_address}
 *   POST /core/v1/add_usage_api_key  (X-Api-Key) scoped-key body         -> {usage_api_key}
 *   POST /core/v1/create_wallet      (X-Api-Key)                          -> {wallet_address}
 *   POST /core/v1/lit_action         (X-Api-Key) {code, js_params?}       -> {response, logs, has_error}
 *   errors: {error, message, fix, docs_url}
 *
 * In STUB MODE nothing leaves this page. The request object is validated
 * against the spec shape, logged to the developer overlay, and answered by a
 * local simulator whose deterministic ops call the SAME functions in
 * protocol.js the compiled action would embed - so the math you see is the
 * math that would run in the enclave. Set ChipotleTransport.live=true and
 * provide a real usage key to send identical bytes to the real API.
 */

"use strict";

const CHIPOTLE_BASE = "https://api.chipotle.litprotocol.com";

const ChipotleTransport = {
  live: false,                     // demo ships stub-only; flip + set apiKey for real calls
  apiKey: "USAGE-KEY-STUBBED-LOCALLY",
  log: [],                         // {t, request, response, stubbed}

  validate(path, init) {
    const problems = [];
    if (!path.startsWith("/core/v1/")) problems.push("path must be under /core/v1/");
    if (init.method !== "POST" && init.method !== "GET") problems.push("method must be GET/POST");
    const needsAuth = path !== "/core/v1/new_account" && path !== "/core/v1/version";
    if (needsAuth && !init.headers["X-Api-Key"]) problems.push("missing X-Api-Key header");
    if (init.method === "POST" && init.headers["Content-Type"] !== "application/json")
      problems.push("POST requires Content-Type: application/json");
    if (path === "/core/v1/lit_action") {
      const body = JSON.parse(init.body);
      if (typeof body.code !== "string" || !body.code.includes("async function main"))
        problems.push("lit_action body.code must be a string defining `async function main`");
      if (body.js_params !== undefined && typeof body.js_params !== "object")
        problems.push("js_params must be an object when present");
    }
    return problems;
  },

  async call(path, body, meta = {}) {
    const init = {
      method: "POST",
      headers: { "X-Api-Key": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
    const problems = this.validate(path, init);
    if (problems.length) {
      const err = { error: "invalid_request", message: problems.join("; "),
        fix: "Correct the request shape before dispatch.", docs_url: "https://developer.litprotocol.com/management/errors" };
      this.record(path, init, err, meta);
      throw new Error(err.message);
    }
    let response;
    if (this.live) {
      const r = await fetch(CHIPOTLE_BASE + path, init);   // identical bytes, real network
      response = await r.json();
    } else {
      response = await ChipotleStub.handle(path, JSON.parse(init.body));
    }
    this.record(path, init, response, meta);
    return response;
  },

  record(path, init, response, meta) {
    const entry = {
      t: new Date().toISOString(),
      stubbed: !this.live,
      meta,
      request: { method: init.method, url: CHIPOTLE_BASE + path,
        headers: { ...init.headers, "X-Api-Key": init.headers["X-Api-Key"] ? "•••" + this.apiKey.slice(-6) : undefined },
        body: JSON.parse(init.body) },
      response,
    };
    this.log.push(entry);
    document.dispatchEvent(new CustomEvent("chipotle-call", { detail: entry }));
  },
};

/* ---------- the local simulator ---------- */

const ChipotleStub = {
  walletCounter: 0,

  async handle(path, body) {
    switch (path) {
      case "/core/v1/create_wallet":
        this.walletCounter++;
        return { wallet_address: "0x" + (await sha256Hex("stub-wallet-" + this.walletCounter)).slice(0, 40) };
      case "/core/v1/lit_action":
        return this.litAction(body);
      default:
        return { error: "not_stubbed", message: `${path} not implemented in local stub`,
          fix: "Extend ChipotleStub.handle", docs_url: "https://developer.litprotocol.com/" };
    }
  },

  async litAction({ code, js_params }) {
    // The stub dispatches on js_params.op. Deterministic ops run the REAL
    // implementations from protocol.js; synthesis ops return canned advisory
    // outputs, clearly labeled. `code` is carried verbatim for the overlay.
    const op = js_params?.op;
    let out, logs = "";
    try {
      switch (op) {
        case "seal_submission": {
          out = { sealed_ref: js_params.sealed_ref, ack: true };
          logs = "ciphertext registered against instrument PKP (stub vault)";
          break;
        }
        case "zopa_round": {
          const bounds = {};
          const termSheets = {};
          for (const ref of js_params.bound_refs) {
            const opened = await Vault.open(ref);
            for (const [pid, payload] of Object.entries(opened)) {
              bounds[pid] = payload.bounds ?? payload;
              if (payload.termSheet) termSheets[pid] = payload.termSheet;
            }
          }
          const zopa = zopaCompute(SCENARIO.obligations, bounds, SCENARIO.protocol.distanceBands);
          const term = termPackageCheck(SCENARIO.termDictionary, termSheets);
          const signals = mergeFeasibilitySignals(signalsOnly(zopa), termSignalsOnly(term));
          const repro = await reproducibilitySignature("zopa_round", { bound_refs: js_params.bound_refs, round: js_params.round }, signals);
          out = { signals, reproducibility: repro };
          logs = "bounds + term sheets decrypted in-enclave; only signals emitted";
          break;
        }
        case "accord_assemble": {
          const bounds = {};
          const termSheets = {};
          for (const ref of js_params.bound_refs) {
            const opened = await Vault.open(ref);
            for (const [pid, payload] of Object.entries(opened)) {
              bounds[pid] = payload.bounds ?? payload;
              if (payload.termSheet) termSheets[pid] = payload.termSheet;
            }
          }
          const zopa = zopaCompute(SCENARIO.obligations, bounds, SCENARIO.protocol.distanceBands);
          const term = termPackageCheck(SCENARIO.termDictionary, termSheets);
          const feasible = zopa.feasible && term.feasible;
          const alloc = feasible ? equalConcessionMidpoint(zopa) : null;
          const repro = await reproducibilitySignature("accord_assemble", { bound_refs: js_params.bound_refs, split_rule: js_params.split_rule }, alloc ?? { infeasible: true });
          out = { feasible, allocation: alloc, termPackage: termSignalsOnly(term), reproducibility: repro };
          logs = alloc ? "split rule applied inside overlap; term hard constraints satisfied" : "no overlap or term conflict - abstain, impasse path";
          break;
        }
        case "s1_decompose": {
          if (!StagedPrompts.verify(js_params.staged_prompt_path, js_params.staged_prompt_sha256))
            return { response: null, logs: "staged prompt hash mismatch - refusing to invoke model", has_error: true };
          out = { advisory: true, slot: "S1", decomposition: SCENARIO.s1Decomposition,
            model_transcript_sha256: await sha256Hex("stub-transcript-s1") };
          logs = "SYNTHESIS (stub): boundary-crossing step; output advisory pending neutral adoption";
          break;
        }
        case "s2_consensus": {
          if (!StagedPrompts.verify(js_params.staged_prompt_path, js_params.staged_prompt_sha256))
            return { response: null, logs: "staged prompt hash mismatch - refusing to invoke model", has_error: true };
          const q = SCENARIO.s2Questions.find((x) => x.id === js_params.question_id);
          out = { advisory: true, slot: "S2", question_id: q.id, votes: q.votes, consensus: q.consensus,
            model_transcript_sha256: await sha256Hex("stub-transcript-" + q.id) };
          logs = "SYNTHESIS (stub): 3-provider strict consensus; ABSTAIN on disagreement";
          break;
        }
        case "s5_neutral_inquiry": {
          if (!StagedPrompts.verify(js_params.staged_prompt_path, js_params.staged_prompt_sha256))
            return { response: null, logs: "staged prompt hash mismatch - refusing to invoke model", has_error: true };
          const corpus = SCENARIO.inquiryCorpus[js_params.party];
          const ql = js_params.query_plaintext_for_stub.toLowerCase();
          let hit = corpus.find((c) => c.match && c.match.some((m) => ql.includes(m)));
          if (!hit) hit = corpus.find((c) => c.default);
          out = { advisory: true, slot: "S5", answer: hit.answer ?? hit.default, citations: hit.cites,
            query_sha256: await sha256Hex(js_params.query_plaintext_for_stub),
            answer_sha256: await sha256Hex(hit.answer ?? hit.default) };
          logs = "SYNTHESIS (stub): grounded over single-party file; content routed to neutral only";
          break;
        }
        case "emit_outcome_signals": {
          out = js_params.signal;   // deterministic assembly happens caller-side via buildOutcomeSignal
          logs = "outcome signal validated: no PII fields, no position fields";
          break;
        }
        default:
          return { response: null, logs: `unknown op ${op}`, has_error: true };
      }
      return { response: out, logs, has_error: false };
    } catch (e) {
      return { response: null, logs: String(e), has_error: true };
    }
  },
};

/* ---------- action source shown in the overlay (what would be pinned to IPFS) ---------- */

const COMPILED_ACTION_PREVIEW = `// COMPILED FROM Lit.Negotiation.SealedAccord@v1 - deterministic spine (excerpt)
// aqua_template_genesis: <embedded at compile time>
const MAX_USD = 5.00, MAX_TOKENS = 200000;                    // R4, compiled constant
const PHASES = ["adopt","intake","structure","present","facts","brackets","accord","impasse"]; // R6
const NEUTRAL_SCOPE = {                                        // R100, compiled constant
  brackets: "convergence_structure_only",
  inquiry: { content: "private_to_neutral", existence: "public_per_query_hash" }
};

async function main({ op, pkpId, ...p }) {
  // R5 halt gate would read neutral:halt(matter_id) before any work.
  switch (op) {
    case "zopa_round": {            // boundary_class: deterministic
      const bounds = await decryptBounds(p.bound_refs, pkpId);   // plaintext exists only here
      const zopa = zopaCompute(OBLIGATIONS, bounds, BANDS);
      return signalsOnly(zopa);      // values never leave the enclave
    }
    case "accord_assemble": {       // boundary_class: deterministic
      const bounds = await decryptBounds(p.bound_refs, pkpId);
      const zopa = zopaCompute(OBLIGATIONS, bounds, BANDS);
      if (!zopa.feasible) return { abstain: true, reason: "no overlap" };
      return { allocation: equalConcessionMidpoint(zopa) };
    }
    case "s2_consensus": {          // boundary_class: boundary-crossing
      if (!(await verifyStagedPrompt(p.staged_prompt_path, p.staged_prompt_sha256)))
        return { abstain: true, reason: "staged prompt hash mismatch" };
      return await strictConsensus(p.question, await decryptKeys(p.encKeys, pkpId)); // advisory
    }
    /* s1_decompose, s5_neutral_inquiry, emit_outcome_signals … */
  }
}`;
