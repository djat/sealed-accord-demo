# Sealed Accord - local reference application

Runnable companion to the flagship demo spec in the `djat-lit-20260704` collaboration bundle
([`collaboration/20260704-223000/demo/SEALED_ACCORD_DEMO.md`](../collaboration/20260704-223000/demo/SEALED_ACCORD_DEMO.md)).
Lives **outside** the sealed bundle, consistent with its no-assets disclosure posture.

## Run

```bash
cd sealed-accord && ./start.sh          # serves on http://localhost:5178
```

No build step, no dependencies, no network: static HTML/JS served by `python3 -m http.server`.

## What it demonstrates

The app opens on an **Executive overview** (what the instrument is, the target use case, adoption path,
market shape) followed by a **Technical overview** (the Pathways × Lit × Aqua architecture and which
claims the running code proves). The **Run the demo** tab then walks a simulated four-vehicle
subrogation matter with three carriers and a human neutral through the full protocol -
**adopt → intake → structure → present → facts → brackets → accord** - with a guided explainer at the
top of every phase. Use **Back** / **Next**, click any phase pill, switch **Viewing as** to act in each seat, or optional **Remote play** for a slow guided pass.

- **Manual navigation**: Back / Next, clickable phase pills (with dependency hints when locked), and per-role actions via **Viewing as**.
- **Remote play** (optional): slow guided walkthrough (~3 min) with Pause / Stop - not on by default.
- **Role switcher** (top bar): view the matter as each carrier, the neutral, or the public record. The
  R100 NeutralScope views are enforced per role - parties never see each other's bounds or term
  classifications; the neutral sees convergence structure, never values; inquiry content is neutral-only
  while inquiry existence is public.
- **Sealed term sheets (intake)**: each party classifies every adopted dictionary term as must have,
  must not have, like to have, or prefer not - encrypted with bounds. Bracket rounds emit term-package
  feasibility signals alongside ZOPA overlap (hard constraints only in this build).
- **Real deterministic math, in-page**: reservation bounds are AES-GCM sealed (the PKP-encrypt stand-in),
  ZOPA feasibility and the equal-concession split rule run on the actual ciphertext-opened values inside
  the "enclave" boundary of `protocol.js`, signals are projected out with private fields stripped, and the
  accord digest is signed per party with real WebCrypto ECDSA P-256 keys. The run record is an
  append-only, hash-chained ledger (Aqua-shaped) built with real SHA-256.
- **LLM-use ledger**: every filed artifact carries a `preparation_disclosure` - direct use (drafting,
  analysis, OCR) and meta use (forensics over evidence) - rendered to the neutral at the present phase.
- **Neutral private inquiry (S5)**: the neutral queries one party's case file at a time; answers are
  grounded, cited, and chambers-private; the existence record (party, query hash, answer hash, time) is
  public to all roles, so equal-dignity counts are auditable.
- **Outcome signals**: on accord, a process-shaped signal (rounds, durations, adoption ratios, disclosure
  profile - no PII, no positions) is emitted and compared against simulated prior protocol-variant cells
  (the longitudinal study of the demo spec §10, after EXP-LCP-4/EXP-LCP-5).

**Not yet in this app:** full Gale-Shapley stable-set package selection among feasible term packages,
  the custom-term legality screen (S6), and advisory legality flags (spec §4.2-§4.3 tail, H-LIT13).
  Hard-term package feasibility and four-class intake are implemented; preference-driven selection is stubbed.

## Developer overlay

Toggle top-right. Six views:

| Tab | Shows |
|---|---|
| Pathway steps | Live step ledger with ZTP `boundary_class` badges and adoption/replay status |
| Chipotle API | Every request built to the published Lit Chipotle REST spec (`POST /core/v1/lit_action` with `X-Api-Key`, `{code, js_params}`) and its stubbed spec-shaped response |
| Run record | The append-only hash chain, revision by revision |
| Staged prompts | ZTP StagePrompt artifacts with `content_sha256` - the only doors into model slots |
| Compiled action | Excerpt of the source `Lit.Pathway.CompileAction@v1` would pin, plus a **reproducibility check** that re-executes the ZOPA math and compares output hashes |
| Outcome signals | The current run's signal JSON + prior aggregated variant cells |

## Stub boundary

`js/chipotle-stub.js` validates every request against the Chipotle API spec (endpoint, auth header,
content type, `main`-function body shape) before answering locally. The deterministic ops in the stub
call the same `protocol.js` functions a compiled action would embed - the math shown is the math that
would run in the enclave. Setting `ChipotleTransport.live = true` with a real usage key sends the
identical bytes to `https://api.chipotle.litprotocol.com` instead; the model slots (S1/S2/S5) return
canned advisory outputs locally and are labeled as such everywhere they appear.

All matter data is fictional.
