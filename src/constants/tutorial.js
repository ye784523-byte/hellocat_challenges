export const TUTORIAL_LESSONS = Object.freeze([
  {
    id: 'orientation',
    title: 'How the terminal works',
    tag: 'ORIENTATION',
    summary: 'Slash commands, private replies and where every feature lives.',
    body:
      'Hello Cat is a self-contained security training terminal for this server. Every feature is a **slash command** — type `/` in the chat box and pick from the list.\n\n' +
      'Most replies are **ephemeral**: only you can see them, so hints, briefings and flag forms never spill into the channel. Commands are grouped into the *challenge engine*, the *field toolkit*, *training simulations*, *progression*, *economy* and *moderation*.\n\n' +
      'Nothing you type here can reach a real third-party system. Every exercise is a fictional lab scenario that lives inside this bot.',
    commands: [
      { usage: '/help', description: 'Paginated index of every command, grouped by function.' },
      { usage: '/about', description: 'What this bot is, and what it will never do.' },
      { usage: '/rules', description: 'Community protocol and acceptable use.' },
      { usage: '/status', description: 'Live runtime telemetry for this server.' },
    ],
    tips: [
      'If a command looks unfamiliar, run `/help` first — the index lists every alternative form.',
      'Ephemeral replies are private to you, so screenshots of briefings and hints are safe to keep.',
    ],
  },
  {
    id: 'quickstart',
    title: 'Your first capture in four steps',
    tag: 'QUICKSTART',
    summary: 'Pick a challenge, read the brief, unlock a hint, solve it in the web terminal.',
    body:
      'The working loop, in order:\n\n' +
      '1. **Pick** an easy target: `/challenge browse difficulty:Easy`.\n' +
      '2. **Read** the brief: `/challenge info id:HC-001`. The objective states exactly what to deliver.\n' +
      '3. **Unstick** yourself: `/hint challenge:HC-001` when the trail goes cold.\n' +
      '4. **Deliver**: open the **SOLVE IN WEB TERMINAL** link. The lab loads the challenge and you submit the flag there.\n\n' +
      'The expected flag is stored only as a keyed HMAC digest, so it is never written in plaintext and never shown to anyone — including staff.',
    commands: [
      { usage: '/challenge browse difficulty:Easy', description: 'List the current easy-tier board.' },
      { usage: '/challenge info id:HC-001', description: 'Full briefing for one challenge.' },
      { usage: '/hint challenge:HC-001', description: 'Unlock the next hint fragment.' },
      { usage: '/challenge start id:HC-001', description: 'Open a challenge with the web terminal link.' },
    ],
    tips: [
      'Start with Easy tier. The beginner labs teach the vocabulary the harder labs assume.',
      'A first capture is worth more than a fast capture — XP is only granted once per challenge.',
    ],
  },
  {
    id: 'browse',
    title: 'Finding a challenge',
    tag: 'CHALLENGE ENGINE',
    summary: 'Filter the database by category, difficulty and keyword.',
    body:
      'The database is filtered server-side, so you never scroll through noise. Optional arguments combine freely: `category`, `difficulty` and `search`.\n\n' +
      '`/categories` prints every category with the number of active challenges — the fastest way to see what is currently loaded and where the gaps are.\n\n' +
      'Eight domains are covered: Linux, Networking, Web Security, Cryptography, Digital Forensics, OSINT, Programming and General Security.',
    commands: [
      { usage: '/challenge browse', description: 'Every active challenge.' },
      { usage: '/challenge browse category:Linux difficulty:Easy', description: 'Combined filters.' },
      { usage: '/challenge browse search:traffic', description: 'Keyword search over titles and IDs.' },
      { usage: '/categories', description: 'Category names with live active counts.' },
    ],
    tips: [
      '`/challenges` is a full alias of `/challenge` — the same subcommands, different name.',
      'Published challenges only. Drafts and offline entries stay invisible until staff activate them.',
    ],
  },
  {
    id: 'brief',
    title: 'Reading a challenge brief',
    tag: 'CHALLENGE ENGINE',
    summary: 'Description, objective, flag format, attempt cap and reward.',
    body:
      'Every brief carries five fields, and they are worth reading in order:\n\n' +
      '• **Description** — the scene: a fictional workstation, a broken service, a suspicious artifact.\n' +
      '• **Objective** — the deliverable, stated precisely. Solve the objective, not the backstory.\n' +
      '• **Flag format** — usually `HC{...}`. Wrap your answer in exactly that shape.\n' +
      '• **Attempts** — some challenges cap wrong submissions. Burn the cap and the challenge locks for you.\n' +
      '• **Reward** — XP granted on the first correct capture only.',
    commands: [
      { usage: '/challenge info id:HC-001', description: 'Read the full brief and telemetry.' },
      { usage: '/challenge start id:HC-001', description: 'Open a challenge with action buttons.' },
      { usage: '/mychallenges', description: 'Your personal captures by difficulty tier.' },
    ],
    tips: [
      'When the objective and the description disagree, the objective wins — it is the contract.',
      'Check the attempt cap before guessing. Some briefs cap you at three or five tries.',
    ],
  },
  {
    id: 'hints',
    title: 'Hints, attempts and dead ends',
    tag: 'CHALLENGE ENGINE',
    summary: 'Spend intelligence fragments wisely instead of burning attempts.',
    body:
      'Hints are numbered from 1 and unlock one at a time. Free hints cost nothing; paid hints cost CATCOINS and are debited only when the fragment is actually unlocked.\n\n' +
      'Order of operations matters: read the brief, take a hint, then attempt. A wrong guess counts as an attempt, and capped challenges can lock you out permanently for that run.\n\n' +
      'Unlocked hints stay unlocked. You can re-read every fragment you have paid for, as often as you like.',
    commands: [
      { usage: '/hint challenge:HC-001', description: 'Unlock the next locked hint.' },
      { usage: '/hint challenge:HC-001 index:2', description: 'Unlock a specific hint number.' },
      { usage: '/challenge info id:HC-001', description: 'See how many hints and attempts remain.' },
    ],
    tips: [
      'A hint that confirms your approach is worth more than a hint that gives the answer.',
      'Free hints first. Save CATCOINS for the challenges where you are genuinely stuck.',
    ],
  },
  {
    id: 'submit',
    title: 'Submitting a flag',
    tag: 'CHALLENGE ENGINE',
    summary: 'Submission happens in the web terminal, with normalized flags and duplicate protection.',
    body:
      'Flags are submitted in the **web terminal**, not in the channel. Every challenge briefing links there and the lab loads the challenge automatically, so you work in a real shell against a fictional filesystem and submit the flag from the same place.\n\n' +
      'Flags are trimmed and internal whitespace is collapsed before hashing, so a stray space or newline will not fail an otherwise correct answer. Casing still matters, and the surrounding `HC{...}` wrapper must be exact.\n\n' +
      'Duplicate protection is enforced: a challenge you already captured awards no further XP, no further coins and no further streak credit. The channel celebrates every capture with your ranking, your total solves and your CATCOINS.',
    commands: [
      { usage: '/challenge start id:HC-001', description: 'Open a challenge and follow the web terminal link.' },
      { usage: '/mychallenges', description: 'See which challenges you already captured.' },
      { usage: '/history', description: 'Your submission log with verdicts.' },
    ],
    tips: [
      'If a correct-looking answer is rejected, re-check the wrapper and the letter case.',
      'One wrong attempt per hypothesis. Test the cheapest hypothesis first.',
    ],
  },
  {
    id: 'toolkit',
    title: 'The field toolkit',
    tag: 'FIELD TOOLKIT',
    summary: 'Offline decoders, ciphers, hashes and artifact analysis.',
    body:
      '`/tools` is the offline workbench. Every subcommand runs locally inside the bot process — no network calls, no host shell, no external service.\n\n' +
      '• `decode` / `encode` — Base64, Base64url, hex, binary, URL, ROT13, Caesar, Atbash, Morse, reversed text.\n' +
      '• `caesar` — all 26 rotations at once, so the readable one is easy to spot.\n' +
      '• `hash` — MD5, SHA1, SHA256, SHA512, or identify a digest found in an artifact.\n' +
      '• `xor` — repeating-key XOR with hex and printable output side by side.\n' +
      '• `vigenere` — encode or decode with an alphabetic key.\n' +
      '• `jwt` — read a JWT header and payload. The signature is never verified.\n' +
      '• `analyze` — pull flags, IPs, domains, URLs, emails, MACs and hash-like values out of a blob.',
    commands: [
      { usage: '/tools decode scheme:base64 text:<artifact>', description: 'Decode a suspicious string.' },
      { usage: '/tools caesar text:<ciphertext>', description: 'Brute-force every Caesar rotation.' },
      { usage: '/tools analyze text:<dump>', description: 'Extract indicators from a capture.' },
      { usage: '/tools hash algorithm:identify text:<digest>', description: 'Recognize an unknown digest.' },
    ],
    tips: [
      '`/tools analyze` is the fastest first move on any pasted artifact — it names the encoding candidates.',
      'The toolkit is offline on purpose: your artifacts never leave this server.',
    ],
  },
  {
    id: 'progress',
    title: 'XP, ranks and achievements',
    tag: 'PROGRESSION',
    summary: 'How experience is earned and what the eight ranks mean.',
    body:
      'XP comes from challenge captures, daily operations, training games and achievements. Every source is idempotent: the same capture, daily or achievement can never be farmed twice.\n\n' +
      'The rank ladder runs Script Kiddie → Packet Scout → Terminal Runner → Cyber Analyst → Exploit Researcher → Security Engineer → Ghost Operator → Root Access.\n\n' +
      'Achievements reward breadth as much as depth — *Polyglot* requires one capture in every category, *Cipher Breaker* five cryptography solves, *Night Shift* a three-day daily streak.',
    commands: [
      { usage: '/profile', description: 'Your operator card: XP, rank, coins, inventory.' },
      { usage: '/rank', description: 'Progress toward your next rank.' },
      { usage: '/leaderboard', description: 'Top operators on this server.' },
      { usage: '/achievements', description: 'Every achievement and its unlock state.' },
    ],
    tips: [
      'Daily operations and games award XP even on days when no challenge fits your level.',
      'Ranks are cosmetic labels for progress — they grant no extra power.',
    ],
  },
  {
    id: 'economy',
    title: 'CATCOINS and cosmetics',
    tag: 'CATCOIN ECONOMY',
    summary: 'A fictional currency that only ever buys cosmetics.',
    body:
      'CATCOINS are earned from captures, dailies and games. They buy cosmetics only — badges, titles and a cosmetic rank accent. There is no real-world value, no cash-out and no trading.\n\n' +
      'Paid hints are the main coin sink, so spend on the challenges you are genuinely stuck on and hoard the rest for the expensive titles.\n\n' +
      'Duplicate-reference protection means one purchase cannot be claimed twice, and inventory checks stop you buying something you already own.',
    commands: [
      { usage: '/balance', description: 'Your CATCOIN balance.' },
      { usage: '/shop', description: 'Available cosmetics and their prices.' },
      { usage: '/buy item:<id>', description: 'Purchase a cosmetic.' },
      { usage: '/inventory', description: 'Everything you own.' },
    ],
    tips: [
      'CATCOINS have no monetary value. Never offer to trade them for real money.',
      'Cheap badges are the cheapest way to fill out a profile; titles are the long-term goal.',
    ],
  },
  {
    id: 'training',
    title: 'Training simulations and daily ops',
    tag: 'TRAINING SIMULATIONS',
    summary: 'Low-risk drills for warm-up, practice and daily streaks.',
    body:
      '• `/quiz` — five multiple-choice security questions with explanations.\n' +
      '• `/guesscommand` — pick the correct Linux command for a scenario.\n' +
      '• `/terminal` — a simulated filesystem with whitelisted command semantics. It never executes anything on the host.\n' +
      '• `/decrypt` — Caesar, ROT13, Atbash, reversal and hex drills.\n' +
      '• `/daily` — one deterministic challenge per day in the server timezone.\n\n' +
      'Solving the daily keeps your streak alive, and streaks pay a bonus on top of the daily reward.',
    commands: [
      { usage: '/daily', description: "Today's operation, streak and bonus." },
      { usage: '/quiz', description: 'Five-question cybersecurity quiz.' },
      { usage: '/guesscommand', description: 'Command reconstruction drill.' },
      { usage: '/terminal', description: 'Sandboxed terminal puzzle.' },
    ],
    tips: [
      'The terminal simulation is a fictional filesystem — no host command can ever run.',
      'Daily operations rotate deterministically, so everyone in the server gets the same target.',
    ],
  },
  {
    id: 'scope',
    title: 'Scope, safety and conduct',
    tag: 'DOCTRINE',
    summary: 'The authorized-learning rules this server operates under.',
    body:
      'Every scenario here is fictional and educational, and no challenge targets a real third-party system.\n\n' +
      'The rules that matter: never attempt access to systems you do not own or have written permission to test, do not share stolen credentials or phishing material, and do not post flags, hints or solutions outside the intended channels.\n\n' +
      'If something looks like a live target, stop and report it to staff. `/mod report` files a confidential report; staff reviews reports privately and every administrative action is audited.',
    commands: [
      { usage: '/rules', description: 'The full community protocol.' },
      { usage: '/mod report', description: 'File a confidential report to staff.' },
      { usage: '/help', description: 'Full command index.' },
    ],
    tips: [
      'Authorized means documented permission — a CTF target you do not own is still out of scope.',
      'Reporting a live target is always the correct move, even when you are certain it is a lab.',
    ],
  },
  {
    id: 'authoring',
    title: 'Authoring challenges (server staff)',
    tag: 'ADMIN CONTROL',
    summary: 'Create, publish and disable challenges without touching data files.',
    body:
      'Staff can author challenges entirely from Discord:\n\n' +
      '1. `/admin challenge-create category:<category> difficulty:<difficulty> xp:<1-10000>` opens a secure modal for the title, description, objective, flag and hints. The flag is hashed immediately and never echoed back.\n' +
      '2. The challenge is created as a **draft** and stays invisible to players.\n' +
      '3. `/admin challenge-publish id:HC-001` activates it and announces it in the challenge channel.\n' +
      '4. `/admin challenge-disable id:HC-001` takes it offline later; existing submissions remain valid.\n\n' +
      'Hints are written one per line as `cost|text`, for example `25|Look at the second token.` — the cost is charged in CATCOINS when the hint is unlocked.',
    commands: [
      { usage: '/admin challenge-create', description: 'Secure modal for a new draft challenge.' },
      { usage: '/admin challenge-publish id:HC-001', description: 'Activate and announce a challenge.' },
      { usage: '/admin challenge-edit id:HC-001', description: 'Edit text, flag, hints, category, difficulty, XP.' },
      { usage: '/admin challenge-list', description: 'Paginated list including drafts.' },
    ],
    tips: [
      'Flags are normalized (trim + collapsed whitespace) before hashing, so briefing text should state the exact wrapper.',
      'Local JSON authoring is still supported under `challenges/` — validate with `npm run validate` before importing.',
    ],
  },
]);

export const TUTORIAL_TRACKS = Object.freeze([
  {
    category: 'Linux',
    focus: [
      'File ownership, permission bits and how `rwx` maps to real access',
      'Process inspection: what is running, what is listening, what holds the file',
      'Log triage: isolating the one interesting line in a noisy file',
      'Shell quoting, globbing and why `;`, `&&` and `|` change meaning',
    ],
    toolkit: ['/tools analyze', '/tools decode', '/tools hash'],
    drill: '/terminal',
    tip: 'Work the Linux labs in order — the easy tier teaches the vocabulary the hard tier assumes.',
  },
  {
    category: 'Networking',
    focus: [
      'The TCP handshake and what each flag actually guarantees',
      'Reading packet headers: addresses, ports, protocol and length',
      'DNS resolution path and where cache poisoning enters',
      'The TLS handshake and why certificate validation matters',
    ],
    toolkit: ['/tools analyze', '/tools hash'],
    drill: '/guesscommand',
    tip: 'Extract addresses with `/tools analyze` before reasoning about a capture.',
  },
  {
    category: 'Web Security',
    focus: [
      'The request lifecycle from DNS to response',
      'Access control: who is allowed to see this object',
      'Input validation and why the blacklist is not a control',
      'Session handling, tokens and cookie flags',
    ],
    toolkit: ['/tools jwt', '/tools analyze'],
    drill: '/quiz',
    tip: 'Read `/tools jwt` output critically — an unverified signature proves nothing.',
  },
  {
    category: 'Cryptography',
    focus: [
      'Classical versus modern primitives and their guarantees',
      'Key handling, key reuse and the cost of a leaked key',
      'Hashing versus encryption, and why password storage needs a KDF',
      'Entropy, randomness and predictable nonces',
    ],
    toolkit: ['/tools caesar', '/tools xor', '/tools vigenere', '/tools hash'],
    drill: '/decrypt',
    tip: 'Classical ciphers are broken by definition — the training value is in the reasoning.',
  },
  {
    category: 'Digital Forensics',
    focus: [
      'Timeline construction and why clocks disagree',
      'Hashing artifacts before you touch them',
      'Metadata, deleted entries and residual data',
      'Chain of custody for anything you might have to report',
    ],
    toolkit: ['/tools hash', '/tools analyze'],
    drill: '/quiz',
    tip: 'Hash first, analyse second. A modified artifact is worthless as evidence.',
  },
  {
    category: 'OSINT',
    focus: [
      'Passive collection and the ethics of scraping public data',
      'Source validation and cross-checking',
      'False positives, honeypots and planted breadcrumbs',
      'Handling personal data responsibly',
    ],
    toolkit: ['/tools analyze'],
    drill: '/guesscommand',
    tip: 'Confirmation bias is the main failure mode — verify before you report.',
  },
  {
    category: 'Programming',
    focus: [
      'Parsing untrusted input safely',
      'Integer overflow, off-by-one and boundary conditions',
      'Memory-safe habits and the bug classes they remove',
      'Debugging discipline: reproduce, isolate, then fix',
    ],
    toolkit: ['/tools encode', '/tools decode'],
    drill: '/terminal',
    tip: 'Write the failing case first — half the labs are really bug-hunting exercises.',
  },
  {
    category: 'General Security',
    focus: [
      'Threat modeling: what can go wrong and who benefits',
      'Defense in depth and why single controls fail',
      'Logging, detection and useful signal-to-noise',
      'Incident response: containment, evidence, recovery',
    ],
    toolkit: ['/tools hash', '/tools analyze'],
    drill: '/daily',
    tip: 'Start from the general security labs — they explain the reasoning the specialist labs reward.',
  },
]);
