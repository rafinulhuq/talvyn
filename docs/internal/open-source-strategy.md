# Open Source Strategy

> **Status:** Draft for discussion — internal, not for publication
> **Written:** 2026-08-27
> **Audience:** founders, engineering lead, and whoever ends up briefing a lawyer
> **Excluded from the public docs site** via `exclude_docs` in `mkdocs.yml`. If you
> move or rename this file, update that list too.

This memo answers five questions that came up together and can't really be
answered apart: what we should open source, what we should hold back, whether
we're entitled to use the words "open source" at all, how we protect the parts
we keep when the software runs on someone else's server, and how the company
takes proper ownership of the code from the developer who wrote it.

Everything here is grounded in the repository as it exists today — roughly
68,000 lines across a 28.8k-line Python backend and a 39.4k-line Next.js
frontend, 26 API routers, and the docs set already in this folder. Where I make
a legal claim I've tried to flag it as something to verify with counsel rather
than something to act on directly. I'm reasoning about the engineering and the
commercial logic; the contracts are somebody else's job.

---

## Start here: two things are broken before the strategy even matters

**There is no `LICENSE` file in this repository.** No license, no copyright
headers, no contributor agreement. That isn't a small oversight. Under the Berne
Convention and every jurisdiction that follows it, code published without a
license is "all rights reserved" by default — which makes this, legally
speaking, the most closed software we could possibly ship. Right now *Talvyn*
is a name on a README, not a licensing posture. Nobody who found this repo could
lawfully run it, and if anyone has, they've been infringing without knowing it.

**The repository lives on a personal GitHub account.** The remote is
`github.com/rafinulhuq/talvyn`, and `.github/workflows/deploy.yml` deploys
production from it through a self-hosted runner sitting on the production box at
`/home/acme-server/...`. That means control of one individual's personal GitHub
account is control of our production environment. There is no company-owned
repository, no second owner, and nothing in the tree recording that the company
has any rights to the code at all.

Neither problem is hard to fix, but both need fixing before any of the strategy
below becomes real. Section 5 lays out the sequence.

---

## 1. What we open and what we keep

The instinct when splitting a product is to draw the line at features — give
away the basic ones, charge for the fancy ones. I think that's the wrong cut
here. The right line for Talvyn runs between **the machinery**, which we
should give away freely, and **the engine's judgment and the content it works
on**, which is where our actual advantage lives.

### What goes in the open repository

Everything that makes the platform run, and everything a self-hoster needs in
order to trust it.

That means the whole infrastructure layer: `docker-compose.yml` and its
production sibling, the `start.sh` hardware detection, the OpenResty config and
its Lua JWT guard, the ARQ worker, Alembic migrations, and the
Prometheus/Grafana/GlitchTip wiring. None of this is a moat. `start.sh` in
particular — the thing that sniffs your VRAM and picks a Gemma size for you — is
some of the best adoption bait in the repo precisely *because* it's
unglamorous plumbing that works.

It also means the data model and the API contract. All twelve tables, the Pydantic
schemas, the OpenAPI surface. Hiding a schema buys nothing and costs us every
integration a third party might have built.

It means the candidate exam runtime — attempts, sectioning, the timer, autosave,
submission — and the whole scoring path. More on why in a moment, because this is
the one I'd argue hardest about.

And it means the unexciting admin surface: authentication, RBAC, the audit log,
trash, the CMS and blog, JD upload and parsing, the Rust WASM parser, webhooks,
exports, and search. Table stakes, all of it. Charging for table stakes is how
open core products get a reputation for being crippleware.

One subtlety on the AI layer. `ai_provider_service.py` and `ollama_service.py`
should be open — the *interface* is the feature, and provider pluggability is a
genuine selling point. What ships with them in the open repo is a reference
prompt set: functional, honest, good enough to evaluate the platform with, and
deliberately not the one we've spent months tuning.

### What stays in the commercial repository

**The tuned prompt registry.** `prompts/gemma.py` is 464 lines, `qwen.py` is 510,
`glm_tasks.py` is 242. That's 1,348 lines with the highest value-to-effort ratio
of anything we own — months of iteration that a competitor could absorb in the
time it takes to read them. There is no version of open sourcing this that
doesn't hand away the part of the product that took the longest to get right.

**The integrity stack.** `ai_risk_service.py`, `ai_detection_service.py`, the
Desklib DeBERTa backend, and the cross-candidate similarity check. There are two
reasons to hold these, and the second one is the one that actually matters. The
first is that they're differentiating work. The second is that
`_SIGNAL_WEIGHTS` in `ai_risk_service.py` is a published gameplan for anyone who
wants to beat the detector — the moment a candidate knows that tab switches are
weighted 0.08 and text AI-likeness is weighted 0.38, they know exactly which
behaviour to change. This is one of the genuinely rare cases where obscurity is a
legitimate control rather than a substitute for one.

**The curated question bank and exam template library.** This is content, not
code, and it should be licensed as data. It's also our most defensible asset,
because unlike source code, nobody can reconstruct it by reading it. It's the
gap between us and TestGorilla's "350+ validated tests," and it's the thing we
should be investing in hardest.

**Highgarden.** The session recording, heatmaps, funnels, feedback widget, and
alerts under `/dashboard/highgarden/*` are a product analytics suite that
happens to live inside our hiring platform. Open sourcing Talvyn shouldn't
mean accidentally open sourcing a second product. Split it out.

**The enterprise layer we haven't built yet.** I grepped for tenancy, orgs,
billing, seats, and license keys, and found nothing — this is greenfield.
SSO/SAML, SCIM, real multi-tenant isolation, seat management, ATS integrations
with Greenhouse and Lever and Workday, retention and residency policy, SOC 2
evidence tooling. This is what enterprises actually write cheques for, and none
of it exists yet, which means none of it has to be untangled from anything.

**Managed hosting and support.** The revenue line that needs no code split at all.

### The argument I'd defend most strongly

**Do not close the scoring path.**

Hiring is explicitly named as a high-risk application in Annex III of the EU AI
Act, and NYC Local Law 144 already requires annual bias audits of automated
employment decision tools. Both of those trends run in one direction, and both of
them make "read our scoring code yourself" a compliance argument our
closed-source competitors structurally cannot make. If a customer's counsel can
open `scoring_service.py` and `evaluation_service.py` and see exactly how a
rejected candidate's number was produced, that's worth more to us than the
handful of competitors who'd bother reading it.

Auditability of scoring is a feature we should be marketing, not an asset we're
leaking.

### The test that keeps us honest

Can a fifty-person company hire successfully using only the open edition,
forever, without paying us anything?

If the answer is yes, we're running an open core business. If the answer is no,
we're running crippleware with a GitHub page, and the community will work that
out faster than we'd like. Every time we're tempted to move something across the
line, that's the question to run it through.

---

## 2. Why "open source" is a defensible claim for this product

Once there's a license in the tree — and only then — the case is strong, and
it's strong for reasons specific to what we built rather than for generic
open-source good vibes.

**The regulatory tailwind is real.** As above: high-risk classification in the
EU, bias-audit mandates in New York, more coming. Every hiring vendor is about
to be asked how their model decides. We can answer by pointing at a repository.

**Our privacy claim happens to be true.** Ollama runs natively on the host,
candidate CVs and answers never leave the customer's machine, and the GLM cloud
path is opt-in and disabled by default. Plenty of vendors say something like
this. Very few can prove it. The difference between a marketing claim and a
verifiable one is exactly the difference between closed and open source, and
it's the difference an HR director's security review will care about.

**Distribution.** Assessment tools get bought after somebody tried them. A
self-hostable free edition is a trial that costs us nothing per user and reaches
buyers whose procurement would never have approved a pilot.

**And it's honest about the shape of the thing.** Most of this repository is
well-built orchestration around open-weight models. The code, by and large, is
not the moat — the prompts, the question content, and the integrations are.
Giving away the part that isn't the moat is cheap, and pretending otherwise
would be the strange decision.

---

## 3. Open core without lying about it

Yes, we can hold parts back and still legitimately use the words. GitLab,
Grafana, Sentry, Mattermost, Metabase, and Odoo all do exactly this and nobody
seriously accuses them of fraud. But the goodwill depends entirely on
discipline, and the ways to lose it are well-documented.

**The public repository has to carry an OSI-approved license.** Open core is
fine. "Source available, described as open source" is the thing that gets
companies dragged.

**Say "open-source core, commercial enterprise edition" — every time.** Not
"Talvyn is open source, full stop." That precision is the entire difference
between GitLab, whom nobody criticises, and the vendors who spend a week on the
front page of Hacker News defending themselves.

**Keep the closed code in a separate repository.** `talvyn` public under an OSI
license, `talvyn-enterprise` private under a commercial EULA. Mixing licenses
inside one tree, with per-directory carve-outs, is what makes people suspect bad
faith even when there isn't any.

**If we ever pick BSL, SSPL, or the Elastic License, we stop calling it open
source and start calling it source-available.** For what it's worth, I'd argue
against those licenses here anyway. They exist to stop hyperscalers reselling
your database as a managed service. Nobody is going to launch AWS Managed
Talvyn. We'd be paying the reputational cost of a non-OSI license to defend
against a threat model that doesn't apply to us.

### Recommendation: AGPL-3.0 for the core

Three reasons, all specific to this codebase.

The first is that **PyMuPDF is already AGPL-3.0**, and it's a hard dependency in
`parser_service.py` — `import fitz`, used for every PDF a customer uploads. Under
AGPL this costs us nothing. Under Apache-2.0, or inside any closed edition, we
would need a commercial license from Artifex or we'd have to swap it out for
`pypdfium2` or `pdfminer.six`. This single dependency constrains the entire
licensing decision, and I'd rather we chose it deliberately than discovered it
during a customer's legal review.

The second is that AGPL's network clause is the right shape for a web platform.
A competitor can't take the engine, run a hosted rival on it, and publish
nothing back.

The third is that we keep the right to relicense anything we own. That's what
makes a commercial edition possible at all, and it's why the CLA in section 5
isn't optional paperwork.

The cost is that some enterprise procurement departments have blanket AGPL bans.
That's handled by dual licensing, which is exactly what the CLA is for.

### One labelling trap worth naming

Our default models are Gemma 3, distributed under Google's Gemma Terms of Use
with an attached prohibited-use policy. That is not an OSI license, and its terms
flow downstream to our users. We say **"runs on open-weight models."** We never
say "open source AI." Someone will check, and being sloppy about this is the
second-easiest way to get criticised after shipping without a license at all.

Separately, before we reference it publicly, somebody needs to actually read the
license on `desklib/ai-text-detector-v1.01`.

---

## 4. Protecting the platform when it runs on the customer's hardware

The honest starting point: **if it runs on hardware they control, it can be
cracked.** Python ships as readable source and JavaScript ships as code the
browser is required to execute — between them, the two least protectable
runtimes in common use. No technical measure survives an attacker with root on
their own box. Anyone who tells you otherwise is selling something, and it's
usually an obfuscator.

So the goal isn't prevention. The goal is to make cracking cost more than
paying, and to make a cracked instance useless and identifiable. In descending
order of how much they actually work:

### Commercial and legal — where most of the protection actually comes from

**Sell to companies, not to individuals.** Enterprises don't crack software.
It's career-ending for whoever signs off, procurement won't allow it, and the
downside of getting caught dwarfs the licence fee. Our buyer is an HR or talent
organisation, which is about the most compliance-conscious buyer segment there
is. This single fact handles the overwhelming majority of the risk, and it's
worth remembering before we spend engineering months on DRM.

Beyond that: a proper EULA on the closed components with explicit
anti-circumvention terms. Circumventing a technical protection measure is
separately actionable in most jurisdictions — DMCA §1201 in the US, Article 7 of
the EU Software Directive — which means even a weak protection measure has legal
teeth that pure copyright doesn't. And contractual audit rights, which cost
nothing to include and are occasionally decisive.

### Architectural — the real technical lever

Keep something on **our** server that the customer genuinely needs and cannot
reproduce.

Serve the curated question bank and the tuned prompt registry from our API
rather than shipping them in the image. A cracked instance with no question
content isn't a competitor, it's an empty shell. Rotate and sign the question
packs so a cracked instance quietly goes stale. Run evaluation as a hosted
service for the premium tier, while local Ollama stays as the open edition's
path.

It's worth noticing that everything I recommended closing in section 1 is
naturally remote-hostable, and everything I recommended opening naturally isn't.
That isn't a coincidence — it's the design constraint. We should draw the
commercial line around what can live on our side of the wire, because that's the
only line a determined customer can't move.

### Licensing enforcement — raises the cost, buys us telemetry

There is currently zero of this in the codebase. No key, no seat count, no
heartbeat. If we go commercial, the shape is:

An Ed25519-signed license file carrying customer ID, seat count, expiry, feature
flags, and optionally a hardware fingerprint. Public key embedded in the shipped
code; private key never leaves our CI or HSM. Verified at boot and periodically
after.

A heartbeat to a license server with a **generous** offline grace period — seven
to thirty days. A hard online requirement will cost us air-gapped enterprise
deals, and those are precisely our best deals.

And watermarking, which I'd rate above everything else in this tier: embed the
customer ID invisibly in generated PDF reports, in question phrasing variants,
and in the license blob itself. When a leaked copy turns up we know whose it is.
Attribution is worth more to us than prevention, because attribution is what
makes the legal tier in the previous section usable.

### Obfuscation — marginal, don't over-invest

Compiling the closed Python through Cython or Nuitka and shipping `.so` binaries
raises the bar from "open the file" to "reverse a binary." That's a real
improvement and a modest one. Worth a week, not worth a quarter. And we never
obfuscate the open core, for obvious reasons.

### Three things not to do

**Don't ship symmetric secrets.** `INTERNAL_API_SECRET` is a shared symmetric
secret today, and the nginx Lua guard performs structural JWT validation only.
That's a reasonable design for infrastructure we control and a broken one for
infrastructure the customer controls — anything symmetric inside an image on
their hardware is already compromised. License verification has to be
asymmetric: they get the public key, we keep the private one.

**Don't put DRM or telemetry in the open edition.** Someone will strip it out
over a weekend and write about it, and we'll have bought an incident for
nothing.

**Don't move authorization to the client.** Our own security audit
(`security-audit-2026-08-17.md`, findings #6, #7, #11, #12) is the record of what
happens when trust leaks toward the edge. We fixed it. On customer hardware the
consequences are worse.

### The summary worth internalising

Our protection is that a cracked instance has stale questions, no updates, no
support, no ATS integrations, no compliance evidence, and a watermark naming
whoever leaked it. Our protection is *not* that the code is unreadable, and we
shouldn't spend money pretending otherwise.

---

## 5. Getting ownership and access from the developer to the company

This is the most urgent section in the memo, and the current state is genuinely
bad. To restate it plainly: the company does not own the code, does not control
the repository, and does not independently control production. All three are
fixable in about a week of unglamorous work.

What's actually true today, from the repository itself:

- The remote is a personal account. There is no company organisation.
- There is no LICENSE, no copyright header, and no contributor agreement anywhere
  in the tree.
- Production deploys from that personal repository via a self-hosted runner on
  the production host.
- All 123 substantive commits are authored under two personal identities (a
  Gmail address and a GitHub noreply address), with no assignment recorded
  anywhere.
- Bus factor is one.

The order below matters. Do not start at step two.

**1. Sign the IP assignment before moving anything.** If there's already an
employment or contractor agreement containing a present-assignment or
work-for-hire clause, this is a Confirmatory IP Assignment. If there isn't, it's
a full IP Assignment Agreement. Either way it needs to cover copyright in all
code, the Talvyn name and any trademark rights, the domains, the prompt sets,
the JD corpus, and the documentation — and it needs to reach back to the first
commit on 2026-08-06. An assignment that only covers future work leaves every
existing commit with the developer, which is the exact opposite of the point.

Two things to raise with counsel while you're there.

*Jurisdiction.* The commit timestamps are `+0600` and the paths in
`docs/enterprise/_facts.md` point at a Bangladeshi home directory. Work-for-hire
defaults differ meaningfully outside US law, and the employee/contractor
distinction matters a great deal. Confirm locally rather than assuming the US
rule.

*AI-authored commits.* Four commits are authored by "Claude" and two by a
Copilot agent. Purely AI-generated code may not attract copyright at all in the
US — see *Thaler v. Perlmutter* and the Copyright Office's human-authorship
guidance. This doesn't create a third-party claim against us, and it isn't cause
for alarm, but it does mean parts of the codebase may be uncopyrightable. The
practical consequence is that our license, our contracts, and our trade-secret
posture carry more weight than copyright alone. Worth knowing, not worth
panicking about.

**2. Create a company-owned GitHub organisation and transfer the repository.**
Company billing, at least two owners — never one — and then `Settings → Transfer
ownership`. Transfer rather than fork: it preserves issues, pull requests, stars,
and sets up redirects so nothing breaks. Add the developer straight back as an
admin. They lose nothing day-to-day, and the company gains the ability to
survive their departure, which is the whole point.

**3. Rotate every credential and re-home it.** From what's referenced in the
tree, at minimum: `INTERNAL_API_SECRET`, `POSTGRES_PASSWORD`,
`CLOUDFLARE_TUNNEL_TOKEN`, `NEXTAUTH_SECRET`, the Resend API key, `GLM_API_KEY`,
`SEED_ADMIN_PASSWORD`, the GlitchTip DSN, the MinIO keys, every Actions secret,
and the self-hosted runner's registration token — which also needs re-registering
against the organisation rather than the personal repo. These go into a
company-controlled secret manager, not somebody's personal vault.

**4. Re-home everything that isn't in git.** The parts people forget: the domain,
the Cloudflare account, the production server itself, the email sending domain
and its DNS records, the container registry, and the `talvyn` name on GitHub,
npm, PyPI, and Docker Hub. Names are cheap to claim now and expensive to
litigate later.

**5. Put licensing into the tree.** `LICENSE` (AGPL-3.0, per section 3),
`NOTICE`, and copyright headers reading `Copyright (c) 2026 ACME AI` — the
company as holder, not the individual. Then `CLA.md` and a CLA bot such as
cla-assistant.

That last item is more consequential than it looks. **Without a CLA we cannot
dual-license.** Which means we can never ship a commercially licensed edition
containing any community contribution, which means the entire open-core plan in
section 1 stops working the first time we merge an outside pull request. After
the IP assignment, this is the highest-leverage item in the memo.

**6. Split the public and private repositories before the first public release.**
Untangling them afterwards is dramatically harder, and anything ever pushed
publicly under AGPL stays AGPL for those commits permanently. There's no taking
it back.

**7. Purge before publishing.** Non-negotiable, and specific to what's actually
sitting in this tree right now:

*Delete `jd_rag/JD_Collection/` and purge it from history with `git
filter-repo`.* It contains dozens of job description PDFs scraped from Reddit —
third-party copyrighted material, carrying real company names and in several
cases contact details. This is the single riskiest thing in the repository to
publish, and it's been committed since early in the project's life, so deleting
the files alone isn't enough.

*Remove `docs/security-audit-2026-08-17.md`.* It documents unremediated backlog
items — default admin credential hardening, magic-token path exposure — which
makes it a map of our own known gaps.

*Remove `docs/enterprise/`* (`_facts.md` contains local filesystem paths and the
complete internal architecture) *and the Rolepilot-branded `.docx` and `.pdf`
reports*, which predate the rebrand and should be checked for client-confidential
content before they go anywhere.

*Scrub the production path default* out of `.github/workflows/deploy.yml`.

*Run gitleaks or trufflehog over the entire history* — 52 MB, 130-plus commits,
and an architecture that until recently leaned on a shared symmetric secret.
Assume something leaked and verify rather than hoping.

*Untrack `site/`*, already flagged as P3 in `feature-checklist.md`.

*And add this memo to the purge list too* — it's excluded from the docs site
build, but it should not travel to the public repository at all.

**8. Set up governance so this doesn't recur.** Branch protection requiring
review, two organisation owners minimum, and a written offboarding checklist so
the next person who leaves doesn't take production access with them.

---

## What I'd do this week

Step 1 and step 3. The IP assignment and the credential rotation.

Everything else in this memo can wait a sprint without anything bad happening.
Those two cannot, because today the company holds neither legal title to the
code nor independent control of the system serving customers. That gap is a
larger risk to the business than anything in the section about cracking — and
unlike most risks, it gets more expensive to close every week we leave it open.

---

## Appendix: what this memo is based on

Verified directly against the repository on 2026-08-27.

| Claim | Where it came from |
| --- | --- |
| ~68k LOC | 28,871 lines of Python under `backend/app`, 39,385 lines of TS/TSX under `frontend/src` |
| No license | No `LICENSE`, `COPYING`, or SPDX header anywhere in the tree |
| Personal-account repo | `git remote -v` → `github.com/rafinulhuq/talvyn` |
| Production deploy path | `.github/workflows/deploy.yml`, `DEPLOY_PATH` default |
| Prompt registry size | `prompts/gemma.py` 464, `qwen.py` 510, `glm_tasks.py` 242, `registry.py` 47, `types.py` 57 |
| Detector weights are gameable | `_SIGNAL_WEIGHTS` in `services/ai_risk_service.py` |
| PyMuPDF is AGPL | `pymupdf==1.28.2` in `backend/requirements.txt`, `import fitz` in `services/parser_service.py` |
| Gemma is not OSI-licensed | Model selection in `start.sh`; Google's Gemma Terms of Use |
| No tenancy, billing, or licensing | Repo-wide grep for tenant / org_id / billing / seat / license_key returned only webhook and search matches |
| Highgarden is a separate product | `frontend/src/app/(admin)/dashboard/highgarden/` — sessions, heatmaps, funnels, feedback, alerts |
| Symmetric internal secret | `INTERNAL_API_SECRET` in `.env.example`; structural-only validation in `nginx/lua/jwt_check.lua` |
| Scraped JD corpus | `jd_rag/JD_Collection/Reddit/` |
| Commit authorship | `git shortlog -sne --all` — 123 commits across two personal identities, 4 by Claude, 2 by a Copilot agent |
