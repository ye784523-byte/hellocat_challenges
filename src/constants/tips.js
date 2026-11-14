/**
 * Daily tips and tricks.
 *
 * The channel assistant posts one entry per day. The rotation is derived
 * from the day of the year so the schedule is stable across restarts and
 * does not depend on a database.
 */

export const TIPS = Object.freeze([
  {
    id: 'defense-in-depth',
    title: 'Defence in depth beats a single perfect control',
    category: 'SECURITY BASICS',
    body:
      'A firewall cannot save you from a weak password, and a password cannot save you from an exposed service. Assume every layer will eventually fail and design so that the failure of one does not expose the next.',
  },
  {
    id: 'least-privilege',
    title: 'Least privilege is the cheapest control you own',
    category: 'ACCESS CONTROL',
    body:
      'Give every account only the permissions its job needs. When a service account is over-privileged, a single compromised process turns into a full compromise of everything that account can reach.',
  },
  {
    id: 'patch-surface',
    title: 'Attackers automate the boring parts',
    category: 'VULNERABILITY MANAGEMENT',
    body:
      'Unpatched services with internet-facing ports are found by scanners within minutes of being exposed. Reducing your attack surface is more effective than reacting to the vulnerability of the month.',
  },
  {
    id: 'logging',
    title: 'You cannot detect what you never logged',
    category: 'MONITORING',
    body:
      'Centralise logs, keep them off the host they describe, and alert on behaviour rather than on single events. A timeline you can reconstruct is worth more than a dashboard nobody reads.',
  },
  {
    id: 'secrets',
    title: 'Secrets belong in a secret store, not in a repository',
    category: 'CREDENTIAL HYGIENE',
    body:
      'A credential in version control stays there forever, even after it is rotated. Inject secrets at runtime, keep a rotation plan, and scan history before you assume a repository is clean.',
  },
  {
    id: 'input-validation',
    title: 'Validate input where it enters your system',
    category: 'APPLICATION SECURITY',
    body:
      'Never build queries or commands by concatenating user input. Use parameterised queries, allow-lists and escaping at the boundary. Defence in the data layer beats escaping at every call site.',
  },
  {
    id: 'phishing',
    title: 'Verify unusual requests out of band',
    category: 'SOCIAL ENGINEERING',
    body:
      'Attackers increasingly skip the software and target the people. An urgent request that arrives by mail, chat or voice should be confirmed through a channel you already trust, never the one the request came from.',
  },
  {
    id: 'encryption',
    title: 'Encryption only protects data at rest',
    category: 'CRYPTOGRAPHY',
    body:
      'TLS protects data in transit and disk encryption protects a stolen laptop. Neither helps once an attacker has code execution on a running system, where keys are decrypted in memory.',
  },
  {
    id: 'containers',
    title: 'Containers are not a security boundary',
    category: 'VIRTUALISATION',
    body:
      'A container shares the host kernel. Namespaces and capabilities reduce the blast radius, but a kernel escape is still a full compromise. Treat containers as packaging, not isolation.',
  },
  {
    id: 'incident-response',
    title: 'Write the playbook before the incident',
    category: 'INCIDENT RESPONSE',
    body:
      'The worst time to design a response plan is during an outage. Decide in advance who declares an incident, who talks to customers and how evidence is preserved.',
  },
  {
    id: 'automation',
    title: 'Automate the checks you always run',
    category: 'DEVOPS',
    body:
      'Manual verification is skipped exactly when it matters most. Put the scan in the pipeline so it runs on every change and fails the build instead of failing a human.',
  },
  {
    id: 'threat-modelling',
    title: 'Model the threat before you model the system',
    category: 'SECURITY DESIGN',
    body:
      'Ask who benefits from breaking this, what they want and what they can reach. The answers decide where the controls belong, and they are cheaper to write than to retrofit.',
  },
  {
    id: 'password-hygiene',
    title: 'Length beats complexity',
    category: 'IDENTITY',
    body:
      'A long passphrase is easier to remember and far harder to crack than a short string full of substitutions. Pair it with a password manager and a second factor.',
  },
  {
    id: 'network-segmentation',
    title: 'Segment the network you actually have',
    category: 'NETWORK SECURITY',
    body:
      'Flat networks turn one foothold into a whole domain. Segment by trust boundary, not by diagram, and verify the rules with traffic you did not intend to allow.',
  },
  {
    id: 'data-handling',
    title: 'Know where your sensitive data lives',
    category: 'DATA SECURITY',
    body:
      'You cannot protect data you have not inventoried. Know which systems hold personal or regulated data, how long you keep it and who can reach it.',
  },
  {
    id: 'honeytokens',
    title: 'Decoys tell you that you were targeted',
    category: 'DETECTION',
    body:
      'A credential or hostname nobody uses should never be touched. When it is, you learn about the intrusion while the attacker still thinks they are invisible.',
  },
]);

/** The tip for a given date, rotating through the catalogue. */
export function tipForDate(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86_400_000);
  return TIPS[day % TIPS.length];
}
