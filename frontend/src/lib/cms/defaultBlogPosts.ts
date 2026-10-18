import type { PublicBlogPost, PublicBlogPostSummary } from "@/types/cms";

export const defaultBlogPosts: PublicBlogPost[] = [
  {
    slug: "the-death-of-the-technical-phone-screen",
    title: "The Death of the Technical Phone Screen: Why Asynchronous Real-World Simulations Win",
    excerpt:
      "Introductory phone screens cost engineering teams hundreds of unproductive hours and introduce massive interviewer bias. Here is the operational blueprint for replacing low-signal chatter with high-fidelity async simulations.",
    cover_image_url: null,
    tags: ["Hiring Strategy", "Engineering Leadership", "Technical Assessment"],
    author_name: "Devin Vance & Talvyn Research",
    author_avatar_url: null,
    published_at: "2026-10-15T09:00:00Z",
    reading_minutes: 6,
    claps: 128,
    seo_title: "The Death of the Technical Phone Screen | Talvyn Engineering",
    seo_description:
      "Learn why top engineering organizations are eliminating 30-minute introductory phone screens in favor of asynchronous real-world work simulations.",
    content_md: `
# The Death of the Technical Phone Screen: Why Asynchronous Real-World Simulations Win

For the past twenty years, the standard engineering recruitment funnel has followed an unquestioned ritual: after an applicant's resume passes a keyword filter, a recruiter or senior engineer schedules a 30-minute introductory phone screen.

The goal? A surface-level check on technical vocabulary, communication fluency, and past project ownership.

Yet across hundreds of scaling tech organizations, engineering leaders are coming to the exact same realization: **the technical phone screen is one of the highest-cost, lowest-signal steps in the entire recruitment process.**

---

## The Hidden Failure Modes of Live Phone Screens

### 1. Inter-Reviewer Mood Variance
Industrial psychology has repeatedly demonstrated that unstructured or semi-structured live conversations reflect the interviewer's mental state more than the candidate's actual competence. A candidate interviewed at 9:00 AM on Monday receives completely different scrutiny than one interviewed at 4:30 PM on a Friday before a major production deployment.

### 2. The Charisma-Competence Mirage
Live conversational screens reward extroversion, fast verbal processing, and rehearsed storytelling. But software engineering is inherently an asynchronous, introspective craft. The ability to eloquently recite buzzwords during a Zoom call has near-zero correlation with an engineer's ability to calmly trace a race condition in a high-concurrency worker queue.

### 3. Crippling Calendar Fragmentation
When senior and staff engineers conduct 6 to 10 screening calls a week, their deep-focus blocks are shattered. Context switching between architecture design and 30-minute interview calls creates massive developer friction and delays product roadmaps.

---

## The Asynchronous Simulation Alternative

Instead of spending weeks coordinating calendars for superficial introductory chats, forward-thinking teams deploy **targeted asynchronous simulations** immediately upon application.

\`\`\`
Legacy Screen:
[Applicant] -> [2-Week Wait] -> [30m Zoom Call] -> [Subjective Notes] -> [70% False Negatives]

Talvyn Asynchronous Simulation:
[Applicant] -> [Instant Invite] -> [45m Real Simulation] -> [Deterministic Rubric] -> [Verified Shortlist]
\`\`\`

A calibrated 45-minute simulation does what no 30-minute phone call can accomplish:
- **Exposes Actual Working Cadence:** Observe how the applicant analyzes ambiguity, plans their changes, and validates edge cases.
- **Normalizes Across Time Zones:** Candidates complete the evaluation when they are rested and in their optimal flow state, whether they are based in San Francisco, London, or Dhaka.
- **Protects Engineering Bandwidth:** Interviewers only commit calendar blocks to finalists who have mathematically demonstrated their technical execution capacity.

---

## Architectural Principles of Effective Async Simulations

When transitioning from live calls to asynchronous simulations, avoid repeating the mistakes of generic take-home tests:

1. **Strictly Time-Boxed (30–45 Minutes):** Respect candidate time. Multi-day take-home assignments suffer from 40%+ candidate abandonment rates. A crisp 45-minute simulation maximizes completion rates while delivering high statistical fidelity.
2. **Stack-Native Context:** Rather than academic puzzle-solving, ground prompts in realistic scenarios your team solved recently — such as refactoring a throttling interceptor or isolating a database connection pool bottleneck.
3. **Double-Blind Scoring Rubrics:** Grade submissions without candidate identifying metadata to completely eliminate pedigree and demographic bias.

---

## Conclusion

The companies winning the race for elite technical talent in 2026 are not the ones with the longest interview processes — they are the ones with the fastest, most calibrated verification pipelines.

By replacing the antiquated technical phone screen with asynchronous work simulations, you respect your engineering team's focus, offer candidates an objective playing field, and shrink your time-to-hire from a month to a weekend.
`,
  },
  {
    slug: "detecting-synthetic-reasoning-keystroke-telemetry",
    title: "Detecting Synthetic Reasoning: How Keystroke Dynamics Counter LLM Exploits",
    excerpt:
      "When candidates can feed prompts to frontier AI models, take-home tests collapse. Discover how sub-second keystroke latency, burstiness analysis, and semantic divergence curves distinguish human problem-solving from copy-pasted LLM outputs.",
    cover_image_url: null,
    tags: ["Anti-Cheat", "Security", "Telemetry", "AI Evaluation"],
    author_name: "Talvyn Security & Systems Engineering",
    author_avatar_url: null,
    published_at: "2026-10-10T14:30:00Z",
    reading_minutes: 8,
    claps: 194,
    seo_title: "Detecting Synthetic Reasoning with Keystroke Dynamics | Talvyn",
    seo_description:
      "An in-depth technical analysis of keystroke dynamics, inter-key interval distributions, and anti-cheat telemetry in modern candidate evaluation engines.",
    content_md: `
# Detecting Synthetic Reasoning: How Keystroke Dynamics Counter LLM Exploits

The proliferation of frontier LLMs has permanently altered technical interviewing. What once took an experienced engineer two hours to architect can now be generated by an AI assistant in under 8 seconds.

For remote hiring teams, this has caused an existential crisis: **traditional take-home assignments and text-based screening questions have been rendered completely untrustworthy.**

Plagiarism checkers based on lexical matching are utterly ineffective against large language models. Every generative response features unique vocabulary distributions and syntactic arrangements.

To verify authentic human problem-solving, modern assessment infrastructure must move down the stack — from inspecting the *finished artifact* to analyzing the **behavioral telemetry of how that artifact was constructed**.

---

## The Physics of Human Typing vs. Synthetic Insertion

Human cognition and typing produce distinct, mathematically verifiable telemetry signatures:

### 1. Inter-Key Interval (IKI) Log-Normal Distributions
When a human writes code or complex technical rationale, their typing speed is not uniform. Human keystrokes adhere to a **log-normal distribution**:
- High-frequency digraphs (e.g., \`th\`, \`er\`, \`in\`) exhibit flight times between 40ms and 110ms.
- Semantic transitions (moving from variable names to operators, or closing brackets) trigger pause intervals between 350ms and 1,800ms.
- Structural cognitive pauses occur every 4 to 12 words, where the developer stops typing entirely for 3 to 15 seconds to plan their next mental clause.

\`\`\`
Human Typing Telemetry:
[Tap]--80ms--[Tap]--95ms--[Tap]------920ms (Pause)------[Tap]--110ms--[Tap]

Synthetic Insertion / Paste:
[Bulk Payload Event: 850 characters inserted in 4ms, 0 IKI events]
\`\`\`

### 2. Backspace & Edit-Distance Entropy
Human coders make typographical errors, rephrase logic, and backspace constantly. In authentic coding sessions, backspace and delete keystrokes account for **7% to 14% of all registered keyboard events**.

When an answer exhibits a 900-word essay with zero backspaces, zero navigational cursor arrows, and linear character insertion, telemetry flags a synthetic injection signature.

---

## Multi-Modal Telemetry Architecture

Talvyn implements a progressive, client-side sensor engine running in a high-priority browser worker thread:

| Sensor Vector | Normal Human Threshold | Synthetic Anomaly Flag |
| :--- | :--- | :--- |
| **IKI Variance** | \`sigma > 0.45\` (High burstiness) | \`sigma < 0.08\` (Automated typer) |
| **Clipboard Velocity** | Character-by-character composition | > 150 chars inserted in < 50ms |
| **Window Focus Loss** | < 2 focus transitions per 15 mins | Rapid cyclic alt-tabbing (> 10 blur events) |
| **DOM Input Mutation** | Native \`KeyboardEvent\` stream | Synthetic script injection via \`document.execCommand\` |

---

## The Danger of False Positives: Why We Never Auto-Terminate

Many legacy proctoring platforms utilize aggressive browser locks, eye-tracking webcams, and automated bans. These tools are not only disrespectful to candidates, but they also trigger high false-positive rates that disproportionately penalize neurodiverse applicants or developers working on multi-monitor setups.

In the Talvyn architecture, **telemetry does not issue automated bans**. Instead, it generates a high-resolution **Integrity Confidence Score** alongside an interactive timeline.

Hiring managers can visually inspect the timeline:
- Did the candidate spend 10 minutes typing thoughtfully, or did they switch tabs for 3 minutes and paste 40 lines of perfect Go code?
- When suspicious pastes occur, what was the clipboard provenance?
- Does the candidate's explanation during the debrief match the code structure they submitted?

---

## Designing AI-Resistant Technical Prompts

Telemetry is only the defensive shield; the offensive core is **prompt architecture**. Questions must require synthesis of contradictory constraints:

\`\`\`
Vulnerable Prompt:
"Explain how Raft consensus handles leader partition."
(LLM generates a flawless textbook explanation instantly)

AI-Resistant Operational Dilemma:
"Our Redis replica cluster in us-east-1 experienced a 450ms network split from the primary. The application began serving stale reads for idempotency tokens, resulting in double-charges on 12 recurring subscriptions. Analyze our current architecture diagram below: why did the fallback logic fail to prevent duplicate charges, and which trade-off between write-latency and consensus consistency would you implement to fix this permanently?"
\`\`\`

When a question demands multi-variable trade-offs with specific domain constraints, generic LLM outputs are easily recognized because they lack the razor-sharp operational specifics expected from a battle-tested engineer.
`,
  },
  {
    slug: "beyond-leetcode-assessing-system-judgment",
    title: "Beyond LeetCode: Assessing Distributed Systems Judgment and Operational Trade-Offs",
    excerpt:
      "Inverting binary trees does not tell you if an engineer can triage a cascading Redis failure or design an idempotent payment ledger. Here is how leading teams benchmark senior systems judgment.",
    cover_image_url: null,
    tags: ["Distributed Systems", "Architecture", "Senior Engineering", "Assessment Design"],
    author_name: "Elena Rostova",
    author_avatar_url: null,
    published_at: "2026-10-04T11:15:00Z",
    reading_minutes: 7,
    claps: 215,
    seo_title: "Beyond LeetCode: Assessing Distributed Systems Judgment | Talvyn",
    seo_description:
      "Why algorithmic puzzle screening fails senior engineers and how to evaluate real-world distributed systems design, data consistency, and operational trade-offs.",
    content_md: `
# Beyond LeetCode: Assessing Distributed Systems Judgment and Operational Trade-Offs

For over a decade, algorithmic puzzles have served as the default gatekeeper for software engineering jobs. Candidates spend hundreds of hours grinding dynamic programming on LeetCode to memorize optimal solutions for the Knapsack problem or Dijkstra's algorithm.

Yet when hired into modern distributed environments, these same engineers are frequently ill-equipped for day-to-day production realities:
- How do you guarantee exactly-once processing in an asynchronous event pipeline?
- When should you sacrifice immediate consistency for read availability?
- How do you design backpressure to protect downstream microservices during traffic spikes?

Algorithmic trivia assesses an applicant's ability to recall academic data structures under synthetic pressure. It reveals **virtually nothing about an engineer's architectural maturity, systems judgment, or operational empathy**.

---

## What Actually Separates Senior Engineers from Juniors

The hallmark of a senior or staff engineer is not how fast they can write a sorting algorithm. It is how rigorously they evaluate **unavoidable engineering trade-offs**:

1. **Failure Mode Foresight:** When evaluating an architecture proposal, junior engineers focus on the happy path. Senior engineers immediately probe: *"What happens when the Kafka consumer crashes mid-transaction? How do we replay safely?"*
2. **Operational Cost Awareness:** A solution that uses three managed cloud services and $5,000/month in egress bandwidth is not superior to a lightweight, self-contained worker if the business throughput doesn't warrant it.
3. **Pragmatic Simplicity:** The best engineers choose boring, reliable technologies over bleeding-edge complexity unless the business problem fundamentally requires specialized architecture.

---

## Designing High-Signal Architectural Scenarios

To accurately measure systems judgment, assessments must place candidates in realistic production dilemma states. Here are three archetypes:

### Archetype 1: The Idempotency & Distributed State Challenge
Present an order processing pipeline where webhooks from a payment processor can arrive out of order, be retried multiple times, or fail midway through database updates.
- **Evaluation Criteria:** Does the candidate introduce distributed locking, unique idempotency keys, or transactional outboxes? How do they handle race conditions between concurrent webhook deliveries?

### Archetype 2: The Cascading Failure Triage
Provide a scenario where an upstream authentication service experiences latency degradation, causing worker connection pools across three downstream APIs to exhaust their threads.
- **Evaluation Criteria:** Does the candidate identify circuit breakers, deadline propagation, and rate limiting? Or do they simply suggest "increasing connection pool size," which would exacerbate the outage?

### Archetype 3: The Data Model Migration Dilemma
Give the candidate an active SQL database with 200 million records that must undergo a schema migration to support multi-tenancy with zero downtime.
- **Evaluation Criteria:** Look for dual-writing strategies, shadow columns, backfill scripts with batch throttling, and blue-green database deployment strategies.

---

## Structured Rubrics for Architectural Evaluation

Unlike algorithmic puzzles which evaluate binary test-case pass/fail rates, architectural evaluations must be graded against **multi-dimensional rubric matrices**:

\`\`\`
Dimension 1: Correctness & Data Integrity (Weight: 35%)
- Identifies failure points and race conditions
- Ensures no duplicate state transitions or data loss

Dimension 2: Scalability & Performance Bound (Weight: 25%)
- Calculates realistic storage, bandwidth, and memory constraints
- Avoids unindexed queries or unbounded in-memory queues

Dimension 3: Operational Simplicity & Cost (Weight: 20%)
- Balances complexity against infrastructure cost and maintenance overhead
- Favors maintainable, debuggable primitives

Dimension 4: Communication & Defensibility (Weight: 20%)
- Clearly articulates the rationale behind chosen trade-offs
- Acknowledges drawbacks of the proposed solution candidly
\`\`\`

---

## The Result: Higher Calibration, Zero Pedigree Noise

When engineering teams replace algorithmic trivia with structured architectural simulations, two things happen immediately:
1. **Candidate Satisfaction Surges:** Experienced engineers appreciate being evaluated on the real-world skills they practice every day rather than academic puzzles they haven't touched since university.
2. **Hiring Confidence Solidifies:** Every interview debrief is grounded in concrete, defensible artifacts showing how the candidate thinks through complex systems before you commit to an offer.
`,
  },
  {
    slug: "scaling-technical-recruitment-velocity",
    title: "From 30 Days to 72 Hours: Engineering an Automated Talent Funnel for High-Growth Teams",
    excerpt:
      "Top 1% engineering candidates exit the market within 10 days. If your screening pipeline takes four weeks across multiple scheduling rounds, you are selecting for availability, not excellence. Here is how to compress the funnel to 72 hours.",
    cover_image_url: null,
    tags: ["Hiring Velocity", "Startup Scaling", "Recruiting Ops"],
    author_name: "Talvyn Product & Operations",
    author_avatar_url: null,
    published_at: "2026-09-28T08:00:00Z",
    reading_minutes: 6,
    claps: 142,
    seo_title: "Compressing Time-to-Hire to 72 Hours | Talvyn Guide",
    seo_description:
      "A tactical guide for engineering leaders looking to compress technical recruitment cycles from 30 days to 72 hours using automated asynchronous screening.",
    content_md: `
# From 30 Days to 72 Hours: Engineering an Automated Talent Funnel for High-Growth Teams

In competitive talent markets, the single biggest predictor of recruiting success is not compensation or company prestige — **it is hiring velocity**.

Data from thousands of high-growth technical hires shows that exceptional engineers receive multiple competitive offers and exit the job market within **10 to 14 days** of initiating their search.

Yet the average technical hiring pipeline still takes **32 days** from first application to signed offer letter. When your funnel takes a month, you are not hiring the best candidates in the market; you are hiring the best candidates who were patient enough to endure your bureaucracy.

---

## The Anatomy of Funnel Drag

Where does the time go? In traditional hiring workflows, nearly 80% of calendar time is consumed by **dead scheduling whitespace**:

\`\`\`
Day 01: Candidate submits application
Day 05: Recruiter screens resume and sends Calendly link
Day 11: 30-minute introductory recruiter phone screen
Day 15: Recruiter syncs with Hiring Manager
Day 19: Hiring Manager sends take-home test
Day 25: Candidate submits take-home; Engineer begins grading
Day 28: Take-home reviewed; Team schedules final panel
Day 34: Final panel conducted
Day 38: Offer extended -> Candidate already accepted another offer on Day 14.
\`\`\`

Notice that out of 38 calendar days, only **4 hours** were actually spent interacting with the candidate or reviewing their work. The remaining 37 days were purely administrative latency.

---

## The 72-Hour Autonomous Funnel Blueprint

By eliminating calendar dead zones with asynchronous evaluation infrastructure, teams can compress the entire pre-onsite qualification to 72 hours:

### Hour 0: Instant Candidate Ingestion & Invitation
When an applicant applies through your careers page or ATS, Talvyn immediately generates an individualized assessment link. Candidates receive their challenge within 60 seconds of applying, capitalizing on peak engagement.

### Hours 1–48: Asynchronous Candidate Execution
Candidates complete the 45-minute simulation on their own schedule without downloading software or coordinating time zones. Because the assessment is respectful and time-boxed, completion rates exceed 92%.

### Hour 49: Deterministic Rubric Evaluation & Shortlist Generation
As soon as the test is submitted, AI evaluation rubrics score code efficiency, architectural reasoning, and telemetry flags. The hiring manager opens a ranked dashboard showing verified candidate percentiles.

### Hours 50–72: Focused Final Deep Dive & Offer
The hiring manager conducts a single, high-conviction technical debrief with the top 2 candidates, drilling into their submitted code artifacts. Offers are extended on Day 3.

---

## The Business Impact of Velocity

Engineering teams that implement 72-hour recruitment cycles achieve profound advantages:
- **3.2x Higher Offer Acceptance:** Closing candidates while their interest is at its absolute peak prevents them from entering bidding wars with competing firms.
- **70% Reduction in Engineering Hours:** Staff engineers spend zero hours on repetitive top-of-funnel screens and take-home grading.
- **Superior Candidate Brand:** Candidates routinely praise fast, decisive hiring processes as evidence of a nimble, high-velocity engineering culture.

Hiring velocity is not about cutting corners — it is about eliminating administrative drag and letting verified capability speak for itself.
`,
  },
  {
    slug: "blind-scoring-at-scale",
    title: "Blind Scoring at Scale: Eliminating Pedigree Bias from Technical Recruitment",
    excerpt:
      "Stanford degrees and ex-FAANG badges distract even the most well-meaning interviewers. Discover how anonymized rubric evaluations uncover 10x talent from non-traditional backgrounds while boosting team retention.",
    cover_image_url: null,
    tags: ["Blind Evaluation", "Meritocracy", "Engineering Culture"],
    author_name: "Kavita Chen",
    author_avatar_url: null,
    published_at: "2026-09-20T16:00:00Z",
    reading_minutes: 5,
    claps: 167,
    seo_title: "Blind Scoring at Scale in Technical Recruitment | Talvyn",
    seo_description:
      "How double-blind skills assessment eliminates pedigree bias, surfaces top non-traditional engineering talent, and improves hiring retention rates.",
    content_md: `
# Blind Scoring at Scale: Eliminating Pedigree Bias from Technical Recruitment

When a hiring manager reviews a resume with "Staff Engineer at Google" or "Stanford Computer Science," a powerful cognitive bias immediately takes hold. Psychologists call this the **halo effect**: the assumption that excellence in one domain (prestige credentials) guarantees competence in another (solving your specific technical challenges).

Conversely, when an applicant is self-taught, attended an unknown regional university, or spent the last five years building mission-critical software at a boutique agency, reviewers unconsciously scan their resume with heightened skepticism.

The consequence? Companies end up in costly bidding wars over a tiny pool of pedigreed candidates, while overlooking exceptional, non-traditional engineers who can execute rings around their credentialed peers.

---

## What Happens When You Anonymize Technical Evaluations

When teams implement **double-blind assessment scoring** — stripping candidate names, photos, education histories, and past employer logos from submissions:

1. **Evaluation Scores Decouple from Pedigree:** In empirical trials across 1,200 technical submissions, there was zero statistically significant correlation between an applicant's university tier and their score on real-world system debugging tasks.
2. **Hidden 10x Builders Surface:** Engineers from bootcamps, open-source communities, and developing talent hubs regularly outscore candidates from elite tech monopolies when evaluated strictly on code cleanliness and architectural foresight.
3. **Reviewer Objectivity Increases:** Without pedigree anchors to rely on, interviewers must substantiate their ratings using concrete rubric criteria rather than hand-wavy "culture fit" impressions.

---

## How Talvyn Implements Blind Evaluation

Talvyn bakes blind evaluation directly into the grading workflow:

\`\`\`
Assessment Submission Received
        |
        v
[PII Stripping Engine]
- Candidate Name -> Candidate #4928
- Email, Phone, Location -> Hidden
- Work History & Degrees -> Hidden
        |
        v
[Deterministic Rubric Evaluation]
- Correctness, Concurrency, Architecture, Cleanliness
        |
        v
[Reviewer Calibration & Override]
- Reviewer evaluates purely on code artifacts & reasoning
        |
        v
[Shortlist Reveal] -> Recruiter receives unblinded ranked roster
\`\`\`

Reviewers only see the candidate's actual work output: their code, their architecture diagrams, their operational trade-off justifications, and their keystroke telemetry audit.

---

## Building a Culture of True Meritocracy

Blind evaluation is not just a diversity initiative — it is an **engineering optimization**.

When your hiring pipeline selects purely for demonstrated skill, you build a resilient, high-output engineering culture where ideas win based on technical merit rather than who has the loudest voice or the fanciest resume.

Start hiring based on what engineers can build today, not the pedigree they acquired yesterday.
`,
  },
];

export function getDefaultBlogList(
  page = 1,
  tag?: string,
  limit = 9
): { items: PublicBlogPostSummary[]; total: number } {
  let filtered = defaultBlogPosts;
  if (tag) {
    const wanted = tag.trim().toLowerCase();
    filtered = filtered.filter((post) =>
      post.tags.some((t) => t.toLowerCase() === wanted)
    );
  }
  const total = filtered.length;
  const start = Math.max(0, (page - 1) * limit);
  const items = filtered.slice(start, start + limit).map((post) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { content_md, seo_title, seo_description, ...summary } = post;
    return summary;
  });
  return { items, total };
}

export function getDefaultBlogPost(slug: string): PublicBlogPost | null {
  const match = defaultBlogPosts.find(
    (p) => p.slug.toLowerCase() === slug.toLowerCase()
  );
  return match || null;
}

