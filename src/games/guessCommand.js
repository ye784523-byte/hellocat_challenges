const SCENARIOS = [
  {
    scenario: 'A fictional workstation is missing from the network inventory. You need the kernel hostname of the local machine.',
    answer: 'hostname',
    options: ['hostname', 'whoami', 'uptime', 'mkdir'],
    explanation: '`hostname` prints the system hostname. `whoami` prints the current user.',
  },
  {
    scenario: 'You must list every file, including hidden dotfiles, in the current lab directory.',
    answer: 'ls -la',
    options: ['ls -la', 'cd ..', 'touch notes.txt', 'chmod 777 .'],
    explanation: '`ls -la` shows long-format listing including hidden entries.',
  },
  {
    scenario: 'A lab log file is too large. You need the final 50 lines to inspect the latest simulated events.',
    answer: 'tail -n 50',
    options: ['tail -n 50', 'head -n 50', 'wc -l', 'sort'],
    explanation: '`tail` reads from the end of a file; `head` reads from the beginning.',
  },
  {
    scenario: 'You need to search a fictional source tree for the string "TODO" recursively.',
    answer: 'grep -r',
    options: ['grep -r', 'find -delete', 'rm -rf', 'du -sh'],
    explanation: '`grep -r` searches recursively through directories.',
  },
  {
    scenario: 'A suspicious process is consuming CPU. You want a snapshot of running processes.',
    answer: 'ps aux',
    options: ['ps aux', 'passwd', 'mount', 'cal'],
    explanation: '`ps aux` lists running processes with user and resource details.',
  },
  {
    scenario: 'You must show the permissions of a file in a lab directory.',
    answer: 'ls -l',
    options: ['ls -l', 'chown', 'umask', 'kill'],
    explanation: '`ls -l` includes permission bits, owner and group.',
  },
  {
    scenario: 'You need the SHA-256 checksum of a downloaded lab artifact to compare against a manifest.',
    answer: 'sha256sum',
    options: ['sha256sum', 'base64', 'gzip', 'ssh-keygen'],
    explanation: '`sha256sum` computes a SHA-256 digest, useful for integrity checks.',
  },
  {
    scenario: 'You need to display the routing table of the isolated lab host.',
    answer: 'ip route',
    options: ['ip route', 'nslookup', 'curl', 'chmod'],
    explanation: '`ip route` shows the routing table. `nslookup` queries DNS.',
  },
];

export function createGuessCommand({ rng = Math.random } = {}) {
  const chosen = SCENARIOS[Math.floor(rng() * SCENARIOS.length)];
  const options = chosen.options.slice().sort(() => rng() - 0.5);
  let finished = false;

  return {
    type: 'guesscommand',
    title: 'COMMAND RECONSTRUCTION',
    submit(input) {
      if (finished) throw new Error('This scenario is already complete.');
      const index = Number(input);
      if (!Number.isInteger(index) || index < 0 || index >= options.length) {
        throw new Error('Select a valid command.');
      }
      finished = true;
      const selected = options[index];
      return {
        correct: selected === chosen.answer,
        finished: true,
        feedback: {
          expected: chosen.answer,
          explanation: chosen.explanation,
          selected,
        },
      };
    },
    view() {
      return {
        kind: 'guesscommand',
        finished,
        scenario: chosen.scenario,
        options,
        answer: finished ? chosen.answer : undefined,
        explanation: finished ? chosen.explanation : undefined,
      };
    },
  };
}
