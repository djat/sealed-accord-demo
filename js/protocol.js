/* Deterministic protocol engine - the "compiled pathway spine".
 * Everything in this file is boundary_class: deterministic. It performs real
 * computation in-page: SHA-256 hashing (WebCrypto), ZOPA feasibility, the
 * equal-concession split rule, an append-only hash-chained run record, and
 * reproducibility signatures (re-execute → compare digest). No model client
 * is imported or reachable from this file - that is the ZTP invariant. */

"use strict";

/* ---------- hashing ---------- */

async function sha256Hex(input) {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(obj) {
  // Deterministic serialization: sorted keys, no whitespace variance.
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

async function hashObj(obj) { return sha256Hex(canonicalJson(obj)); }

/* ---------- run record: append-only hash chain (Aqua-shaped) ---------- */

const RunRecord = {
  revisions: [],
  async append(kind, payload, boundaryClass, meta = {}) {
    const prev = this.revisions.length ? this.revisions[this.revisions.length - 1].revision_hash : "GENESIS";
    const body = { kind, payload_hash: await hashObj(payload), boundary_class: boundaryClass, prev, t: Date.now(), ...meta };
    const revision_hash = await hashObj(body);
    const entry = { ...body, revision_hash, payload };
    this.revisions.push(entry);
    document.dispatchEvent(new CustomEvent("run-record-append", { detail: entry }));
    return entry;
  },
  root() { return this.revisions.length ? this.revisions[this.revisions.length - 1].revision_hash : "GENESIS"; },
};

/* ---------- sealed submissions (PKP-encrypt stand-in) ----------
 * Real deployment: Lit.Actions.Encrypt to the instrument PKP.
 * Local stub: AES-GCM under a page-held key, so ciphertexts are real
 * ciphertexts and plaintext bounds never sit in the UI state of other roles. */

const Vault = {
  key: null,
  store: new Map(), // ref -> { iv, ct }
  async init() { this.key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); },
  async seal(label, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const pt = new TextEncoder().encode(canonicalJson(obj));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.key, pt));
    const ref = `ct:${label}:${(await sha256Hex(ct)).slice(0, 16)}`;
    this.store.set(ref, { iv, ct });
    return { ref, preview: [...ct.slice(0, 24)].map((b) => b.toString(16).padStart(2, "0")).join("") + "…" };
  },
  async open(ref) {
    const e = this.store.get(ref);
    if (!e) throw new Error("no such ciphertext: " + ref);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: e.iv }, this.key, e.ct);
    return JSON.parse(new TextDecoder().decode(pt));
  },
};

/* ---------- party signing keys (real ECDSA P-256, generated per session) ---------- */

const Keys = {
  pairs: new Map(),
  async ensure(id) {
    if (!this.pairs.has(id)) {
      const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
      const addr = (await sha256Hex(raw)).slice(0, 40);
      this.pairs.set(id, { kp, addr });
    }
    return this.pairs.get(id);
  },
  async sign(id, digestHex) {
    const { kp } = await this.ensure(id);
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, new TextEncoder().encode(digestHex));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  },
  async verify(id, digestHex, sigHex) {
    const { kp } = await this.ensure(id);
    const sig = new Uint8Array(sigHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, kp.publicKey, sig, new TextEncoder().encode(digestHex));
  },
};

/* ---------- ZOPA + split rule (the settlement arithmetic) ---------- */

function zopaCompute(obligations, sealedBounds, bandDefs) {
  // sealedBounds: { partyId: { oblId: {maxPay?|minAccept?} } } - decrypted inside this call only.
  const perObl = obligations.map((o) => {
    const payerMax = sealedBounds[o.payer]?.[o.id]?.maxPay;
    const payeeMin = sealedBounds[o.payee]?.[o.id]?.minAccept;
    if (payerMax == null || payeeMin == null) return { id: o.id, defined: false };
    const overlap = payerMax >= payeeMin;
    const gap = overlap ? 0 : payeeMin - payerMax;
    const width = overlap ? payerMax - payeeMin : 0;
    const dist = overlap ? width : gap;
    const band = bandDefs.find((b) => dist < b.max)?.label ?? "wide";
    return { id: o.id, defined: true, overlap, band, /* private: */ _payerMax: payerMax, _payeeMin: payeeMin };
  });
  const feasible = perObl.every((r) => r.defined && r.overlap);
  return { perObl, feasible };
}

function equalConcessionMidpoint(zopa) {
  // For each obligation with overlap [payeeMin, payerMax], settle at midpoint  - 
  // equal concession from each side's boundary. Deterministic, order-free.
  const alloc = {};
  for (const r of zopa.perObl) {
    if (!r.overlap) return null;
    alloc[r.id] = Math.round((r._payerMax + r._payeeMin) / 2);
  }
  return alloc;
}

// Public-signal projection: strips every private field. This is what leaves the "enclave".
function signalsOnly(zopa) {
  return {
    feasible: zopa.feasible,
    perObl: zopa.perObl.map((r) => ({ id: r.id, overlap: !!r.overlap, band: r.band ?? "undefined" })),
  };
}

/* ---------- sealed term sheets (four-class package constraints) ---------- */

const TERM_CLASSES = ["must_have", "must_not_have", "like_to_have", "prefer_not"];

function defaultTermPackage(dictionary) {
  const pkg = {};
  for (const t of dictionary.terms) {
    if (t.kind === "choice") pkg[t.id] = t.options[0].id;
    else pkg[t.id] = true;
  }
  return pkg;
}

function termViolatesHardConstraint(term, entry, pkgValue) {
  if (!entry || !term) return false;
  if (entry.class === "must_have") {
    if (entry.prefer != null) return pkgValue !== entry.prefer;
    if (term.kind === "toggle") return !pkgValue;
  }
  if (entry.class === "must_not_have") {
    if (entry.prefer != null) return pkgValue === entry.prefer;
    if (term.kind === "toggle") return !!pkgValue;
  }
  return false;
}

function termPackageCheck(dictionary, partySheets) {
  const pkg = defaultTermPackage(dictionary);
  const conflicts = [];
  for (const [partyId, sheet] of Object.entries(partySheets)) {
    for (const [termId, entry] of Object.entries(sheet)) {
      const term = dictionary.terms.find((t) => t.id === termId);
      const pkgVal = pkg[termId];
      if (termViolatesHardConstraint(term, entry, pkgVal))
        conflicts.push({ party: partyId, termId, class: entry.class });
    }
  }
  const bindingTerms = [...new Set(conflicts.map((c) => c.termId))];
  return { feasible: conflicts.length === 0, bindingTerms, conflicts, proposed: pkg };
}

function termSignalsOnly(check) {
  return {
    feasible: check.feasible,
    bindingTerms: check.feasible ? [] : check.bindingTerms,
    hardConflictCount: check.conflicts?.length ?? 0,
  };
}

function mergeFeasibilitySignals(zopaSignals, termSignals) {
  return { ...zopaSignals, termPackage: termSignals, feasible: zopaSignals.feasible && termSignals.feasible };
}

/* ---------- reproducibility signature ---------- */

async function reproducibilitySignature(fnName, inputs, output) {
  return {
    step: fnName,
    inputs_hash: await hashObj(inputs),
    output_hash: await hashObj(output),
  };
}

async function replayVerify(fnName, inputs, expectedOutputHash, executor) {
  const out2 = executor(inputs);
  const h2 = await hashObj(out2);
  return { step: fnName, replay_hash: h2, match: h2 === expectedOutputHash };
}

/* ---------- staged prompts (ZTP StagePrompt) ---------- */

const StagedPrompts = {
  store: new Map(),
  async stage(slot, template, vars) {
    // Pure substitution only - no model, no dynamic code.
    let text = template;
    for (const [k, v] of Object.entries(vars)) text = text.split("{{" + k + "}}").join(String(v));
    const content_sha256 = await sha256Hex(text);
    const path = `_staged_prompts/${SCENARIO.matterId}/${slot}/${content_sha256.slice(0, 12)}.txt`;
    this.store.set(path, { text, content_sha256, slot });
    await RunRecord.append("staged_prompt", { slot, path, content_sha256 }, "deterministic");
    return { path, content_sha256, text };
  },
  verify(path, expectedHash) {
    const e = this.store.get(path);
    return !!e && e.content_sha256 === expectedHash;
  },
  get(path) { return this.store.get(path); },
};

/* ---------- outcome signals ---------- */

function buildOutcomeSignal(state) {
  const perPartyInquiries = {};
  for (const p of SCENARIO.parties) perPartyInquiries[p.id] = state.inquiries.filter((q) => q.party === p.id).length;
  const disc = { drafting: 0, analysis: 0, forensics_meta: 0, translation_ocr: 0, none: 0 };
  for (const p of SCENARIO.parties) for (const a of p.caseFile) {
    const c = a.disclosure.use_class;
    if (c === "forensics") disc.forensics_meta++;
    else if (disc[c] != null) disc[c]++;
  }
  return {
    protocol: {
      template: SCENARIO.protocol.template,
      compiled_cid: state.compiledCid,
      fork_lineage: ["pw_sealed_accord_v1_genesis"],
      split_rule: SCENARIO.protocol.splitRule,
      impasse_mode: SCENARIO.protocol.impasseMode,
    },
    dispute_category: SCENARIO.disputeCategory,
    outcome: state.accord ? "accord" : (state.round >= SCENARIO.protocol.maxRounds ? "impasse_final_offer" : "in_progress"),
    rounds_used: state.round,
    parties: SCENARIO.parties.length,
    s2_findings: {
      designated: state.s2.length,
      adopted: state.s2.filter((q) => q.decision === "adopted").length,
      rejected: state.s2.filter((q) => q.decision === "rejected").length,
      abstained: state.s2.filter((q) => q.consensus === "ABSTAIN").length,
    },
    inquiry_counts_per_party: perPartyInquiries,
    disclosure_profile: disc,
  };
}
