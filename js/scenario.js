/* Sealed Accord demo - simulated matter data.
 * Matter: four-vehicle chain collision, I-80 westbound; three carriers hold paid claims.
 * All figures fictional. No real parties, adjusters, or policies. */

const SCENARIO = {
  matterId: "SA-2026-000417",
  disputeCategory: "subrogation.multi_vehicle",
  caption: "In re: I-80 WB chain collision of 2026-03-14 - inter-carrier allocation",
  protocol: {
    template: "Lit.Negotiation.SealedAccord@v1",
    splitRule: "equal_concession_midpoint",
    maxRounds: 6,
    impasseMode: "final_offer",
    distanceBands: [
      { max: 2500, label: "narrow (< $2.5k)" },
      { max: 10000, label: "moderate (< $10k)" },
      { max: Infinity, label: "wide (≥ $10k)" },
    ],
    packageRule: "median_stable",
  },
  // Adopted term dictionary (compiled into protocol CID). Legality bases are
  // pre-screened at protocol adoption; parties classify privately at intake.
  termDictionary: {
    version: "subrogation.terms.v1",
    terms: [
      { id: "T1", label: "Payment timing", kind: "choice",
        options: [{ id: "net_30", label: "Net 30 days" }, { id: "net_60", label: "Net 60 days" }] },
      { id: "T2", label: "90-day mutual confidentiality", kind: "toggle" },
      { id: "T3", label: "No admission of liability", kind: "toggle",
        legality: "standard subrogation posture; non-waivable rights preserved by limits table" },
      { id: "T4", label: "Mutual release of claims arising from this loss", kind: "toggle" },
      { id: "T5", label: "FRE 408 / mediation privilege acknowledgment", kind: "toggle",
        legality: "privilege posture; required in most forum variants" },
      { id: "T6", label: "Confidentiality carve-out: regulator & court-ordered disclosure", kind: "toggle",
        legality: "mandatory carve-out - limits table refuses terms that strike it" },
    ],
  },
  neutral: {
    id: "neutral",
    name: "Hon. R. Calloway (Ret.)",
    did: "did:key:z6MkNEUTRALcalloway",
    practiceProfile: "settlement-standards@v1",
  },
  // Pairwise obligations under negotiation: who may owe whom.
  // Fault theory: V1 (Atlas insured) initiated; V2 (Meridian) followed too closely;
  // V3 (Cascadia) was stopped but had disputed brake-light function.
  obligations: [
    { id: "AtoB", payer: "atlas", payee: "meridian", label: "Atlas → Meridian (V2 damage share)" },
    { id: "AtoC", payer: "atlas", payee: "cascadia", label: "Atlas → Cascadia (V3 damage share)" },
    { id: "BtoC", payer: "meridian", payee: "cascadia", label: "Meridian → Cascadia (following-distance share)" },
  ],
  parties: [
    {
      id: "atlas", name: "Atlas Mutual", color: "#6fa8dc",
      counsel: "K. Ibarra", paid: 48200,
      // PRIVATE reservation bounds per obligation (never rendered to other roles)
      bounds: {
        AtoB: { maxPay: 21000 },
        AtoC: { maxPay: 14000 },
      },
      termSheet: {
        T1: { class: "like_to_have", prefer: "net_30" },
        T2: { class: "like_to_have" },
        T3: { class: "must_have" },
        T4: { class: "like_to_have" },
        T5: { class: "must_have" },
        T6: { class: "must_have" },
      },
      caseFile: [
        { id: "atlas-ex1", title: "Adjuster liability memo (V1 initiation)", kind: "narrative",
          disclosure: { use_class: "drafting", mode: "direct", tool: "claris-legal-70b", operator: "K. Ibarra" },
          text: "Our insured (V1) concedes initiating contact with V2 after hydroplaning; memo argues comparative reduction for V2 following distance under UVC 10-8-64 analog. Reconstruction estimates V2 gap at 0.8s at impact." },
        { id: "atlas-ex2", title: "Telematics extraction, V1 (speed/brake trace)", kind: "exhibit",
          disclosure: { use_class: "forensics", mode: "meta", tool: "traceproof-2.1", operator: "K. Ibarra",
            note: "model-assisted consistency check of ECU export vs dashcam timestamps" },
          text: "V1 ECU: 61 mph at T-4.2s, ABS engagement T-2.9s, delta-v 22 mph. Forensic pass found timestamps internally consistent; one gap of 0.4s flagged as sensor dropout, not edit." },
        { id: "atlas-ex3", title: "Weather service certification, I-80 MP 212", kind: "exhibit",
          disclosure: { use_class: "none" },
          text: "Certified precipitation record: 0.31 in/hr at collision window; standing-water advisory active." },
      ],
    },
    {
      id: "meridian", name: "Meridian Casualty", color: "#93c47d",
      counsel: "D. Osei", paid: 36900,
      // Opens aggressively: demands more from Atlas than Atlas will pay (round-1 gap).
      bounds: {
        AtoB: { minAccept: 24500 },
        BtoC: { maxPay: 7000 },
      },
      termSheet: {
        T1: { class: "like_to_have", prefer: "net_60" },
        T2: { class: "prefer_not" },
        T3: { class: "must_have" },
        T4: { class: "must_have" },
        T5: { class: "must_have" },
        T6: { class: "must_have" },
      },
      caseFile: [
        { id: "mer-ex1", title: "Position statement (V2 defensive posture)", kind: "narrative",
          disclosure: { use_class: "drafting", mode: "direct", tool: "claris-legal-70b", operator: "D. Osei" },
          text: "V2 maintains 1.4s following distance per our reconstruction; disputes Atlas's 0.8s figure. Argues V3 brake lights inoperative, elevating V2's share of the V3 claim unfairly." },
        { id: "mer-ex2", title: "Dashcam frame analysis, V2 forward camera", kind: "exhibit",
          disclosure: { use_class: "forensics", mode: "meta", tool: "frameproof-1.4", operator: "D. Osei",
            note: "manipulation screen + frame-interval reconstruction of V3 brake-light state" },
          text: "Frame-interval reconstruction: V3 left brake lamp dark across 47 frames pre-impact; right lamp indeterminate (glare). No splice or re-encode indicators." },
      ],
    },
    {
      id: "cascadia", name: "Cascadia Insurance Group", color: "#e6a06f",
      counsel: "M. Reyes", paid: 22400,
      // Opens above Meridian's ceiling on BtoC (round-1 gap on that obligation too).
      bounds: {
        AtoC: { minAccept: 9500 },
        BtoC: { minAccept: 8200 },
      },
      termSheet: {
        T1: { class: "like_to_have", prefer: "net_30" },
        T2: { class: "like_to_have" },
        T3: { class: "must_have" },
        T4: { class: "must_not_have" },
        T5: { class: "must_have" },
        T6: { class: "must_have" },
      },
      caseFile: [
        { id: "cas-ex1", title: "Repair invoice + maintenance history, V3", kind: "exhibit",
          disclosure: { use_class: "translation_ocr", mode: "direct", tool: "docparse-ocr-3", operator: "M. Reyes" },
          text: "Brake lamp assembly replaced 2026-01-22 (51 days pre-loss); state inspection passed 2026-02-02. OCR of shop records; totals verified against carrier payment ledger." },
        { id: "cas-ex2", title: "Statement of insured (V3 stationary, hazards on)", kind: "narrative",
          disclosure: { use_class: "none" },
          text: "Insured states V3 was fully stopped for upstream congestion with hazard lamps active ~15s before impact. Corroborated by independent witness W2." },
      ],
    },
  ],
  // S1 stub output - neutral decomposition (identical to all parties once adopted)
  s1Decomposition: {
    elements: [
      { id: "E1", text: "V1 initiated first contact (conceded)" },
      { id: "E2", text: "V2 following distance at impact (0.8s vs 1.4s - disputed)" },
      { id: "E3", text: "V3 brake-lamp operability at time of loss (disputed)" },
      { id: "E4", text: "Weather as superseding/mitigating factor (partially conceded)" },
    ],
    obligationsLattice: ["AtoB", "AtoC", "BtoC"],
  },
  // S2 stub - designated questions the neutral may send to multi-model consensus
  s2Questions: [
    { id: "Q1", text: "Do the V1 telematics and V2 dashcam agree that V3 was fully stationary ≥10s before impact?",
      votes: { perplexity_sonar: "YES", anthropic: "YES", openai: "YES" }, consensus: "YES" },
    { id: "Q2", text: "Is the V3 left brake lamp shown dark in the pre-impact dashcam frames?",
      votes: { perplexity_sonar: "YES", anthropic: "YES", openai: "YES" }, consensus: "YES" },
    { id: "Q3", text: "Does the maintenance record establish the lamp was operative at the time of loss?",
      votes: { perplexity_sonar: "UNCLEAR", anthropic: "NO", openai: "UNCLEAR" }, consensus: "ABSTAIN" },
  ],
  // Grounded-answer stubs for the neutral's private inquiry (S5), keyed by party.
  inquiryCorpus: {
    atlas: [
      { match: ["telematics", "speed", "brake", "ecu", "dropout"], answer:
        "Atlas's telematics exhibit shows V1 at 61 mph four seconds out with ABS engagement at T-2.9s; the forensic pass (disclosed as meta-use of traceproof-2.1) flagged a 0.4s gap as sensor dropout rather than edit. The liability memo concedes V1 initiation and hangs its comparative-reduction theory on a 0.8s V2 following gap.", cites: ["atlas-ex2", "atlas-ex1"] },
      { match: ["weather", "rain", "hydroplan"], answer:
        "The certified weather record puts precipitation at 0.31 in/hr with a standing-water advisory active; Atlas's memo uses this to frame V1's hydroplaning as foreseeable-but-mitigating rather than negligent per se.", cites: ["atlas-ex3", "atlas-ex1"] },
      { default: "Atlas's file consists of a drafted liability memo (disclosed direct model use), a forensically screened telematics extraction (disclosed meta use), and a certified weather record (no model use). Its theory: conceded initiation, mitigated by weather, reduced by V2's following distance.", cites: ["atlas-ex1", "atlas-ex2", "atlas-ex3"] },
    ],
    meridian: [
      { match: ["brake", "lamp", "light", "frame", "dashcam"], answer:
        "Meridian's frame-interval reconstruction (disclosed meta-use of frameproof-1.4) reports the V3 left brake lamp dark across 47 pre-impact frames with the right lamp indeterminate due to glare, and found no splice or re-encode indicators. This is the load-bearing exhibit for shifting part of the V3 claim off Meridian.", cites: ["mer-ex2"] },
      { match: ["following", "distance", "gap", "0.8", "1.4"], answer:
        "Meridian's position statement (disclosed direct model drafting) claims a 1.4s following distance against Atlas's 0.8s reconstruction; the dispute is unresolved in the filings and was designated as element E2 in the adopted decomposition.", cites: ["mer-ex1"] },
      { default: "Meridian's file pairs a model-drafted position statement with a forensic dashcam analysis; its two theories are adequate following distance (E2) and V3 brake-lamp failure (E3).", cites: ["mer-ex1", "mer-ex2"] },
    ],
    cascadia: [
      { match: ["maintenance", "repair", "inspection", "lamp", "replaced"], answer:
        "Cascadia's OCR'd shop records (disclosed translation/OCR use) show the brake lamp assembly replaced 51 days before the loss and a passed state inspection thereafter - probative of operability but not dispositive for the moment of loss, which is why designated question Q3 returned ABSTAIN.", cites: ["cas-ex1"] },
      { match: ["stationary", "stopped", "hazard", "witness"], answer:
        "Cascadia's insured statement (no model use disclosed) has V3 fully stopped with hazards active ~15s pre-impact, corroborated by witness W2; consensus question Q1 confirmed stationarity across all three models.", cites: ["cas-ex2"] },
      { default: "Cascadia's file is thin but clean: OCR'd maintenance records supporting lamp operability and an unassisted insured statement establishing V3 was stationary with hazards on.", cites: ["cas-ex1", "cas-ex2"] },
    ],
  },
  // Longitudinal comparison stub: prior aggregated outcome cells for two protocol variants.
  outcomeLedgerPrior: [
    { compiled_cid: "bafyVARIANTfinaloffer01", variant: "equal_concession_midpoint + final_offer impasse",
      dispute_category: "subrogation.multi_vehicle", n: 41,
      accord_rate: 0.78, median_rounds: 3, median_duration_days: 11,
      s2_adoption_ratio: 0.81, compliance_confirmed_rate: 0.95 },
    { compiled_cid: "bafyVARIANTmediatoronly02", variant: "equal_concession_midpoint, no final-offer threat",
      dispute_category: "subrogation.multi_vehicle", n: 37,
      accord_rate: 0.62, median_rounds: 5, median_duration_days: 19,
      s2_adoption_ratio: 0.79, compliance_confirmed_rate: 0.93 },
  ],
};

const ROLES = [
  { id: "atlas", label: "Atlas Mutual", kind: "party" },
  { id: "meridian", label: "Meridian Casualty", kind: "party" },
  { id: "cascadia", label: "Cascadia Ins. Grp", kind: "party" },
  { id: "neutral", label: "Neutral (Hon. Calloway)", kind: "neutral" },
  { id: "public", label: "Public record", kind: "public" },
];

const PHASES = ["adopt", "intake", "structure", "present", "facts", "brackets", "accord"];
