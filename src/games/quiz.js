const QUESTIONS = [
  {
    question: 'Which Linux command displays the manual page for another command?',
    options: ['man', 'ls', 'chmod', 'ps'],
    correct: 0,
    explanation: '`man` opens the system manual for a command or topic.',
  },
  {
    question: 'Which HTTP response header helps mitigate cross-site scripting by restricting resource sources?',
    options: ['Content-Security-Policy', 'Server', 'Accept-Encoding', 'X-Powered-By'],
    correct: 0,
    explanation: 'A Content-Security-Policy restricts which scripts and resources a page may load.',
  },
  {
    question: 'What does the CIA triad stand for in security?',
    options: [
      'Confidentiality, Integrity, Availability',
      'Control, Inspection, Authorization',
      'Cryptography, Identity, Access',
      'Confidentiality, Isolation, Auditing',
    ],
    correct: 0,
    explanation: 'Confidentiality, Integrity and Availability are the classic security goals.',
  },
  {
    question: 'A keyed hash used to verify message authenticity and integrity is called a:',
    options: ['HMAC', 'CRC32', 'UUID', 'Base64 string'],
    correct: 0,
    explanation: 'HMAC combines a cryptographic hash with a secret key.',
  },
  {
    question: 'Which port does HTTPS use by default?',
    options: ['443', '21', '25', '3306'],
    correct: 0,
    explanation: 'HTTPS defaults to TCP port 443.',
  },
  {
    question: 'What is the purpose of a salt when hashing passwords?',
    options: [
      'Make precomputed rainbow tables impractical',
      'Encrypt the password symmetrically',
      'Compress the password',
      'Reduce hash length',
    ],
    correct: 0,
    explanation: 'A unique salt forces attackers to attack each hash separately.',
  },
  {
    question: 'In digital forensics, what does chain of custody document?',
    options: [
      'Who handled evidence and when',
      'The suspect\'s browser history only',
      'Firewall rules',
      'The server uptime',
    ],
    correct: 0,
    explanation: 'Chain of custody tracks evidence handling to preserve admissibility.',
  },
  {
    question: 'Which command shows active network connections on Linux?',
    options: ['ss', 'tar', 'grep', 'useradd'],
    correct: 0,
    explanation: '`ss` inspects socket statistics and active connections.',
  },
  {
    question: 'What does the principle of least privilege require?',
    options: [
      'Grant only the access needed for a task',
      'Give every admin root access',
      'Disable all logging',
      'Share one account across the team',
    ],
    correct: 0,
    explanation: 'Least privilege limits the blast radius of a compromised account.',
  },
  {
    question: 'A Caesar cipher is an example of which cipher class?',
    options: ['Substitution cipher', 'Block cipher', 'Hash function', 'Public key cipher'],
    correct: 0,
    explanation: 'Each letter is substituted by another at a fixed shift.',
  },
  {
    question: 'Which file commonly stores Linux user account information?',
    options: ['/etc/passwd', '/etc/hosts', '/var/log/syslog', '/proc/cpuinfo'],
    correct: 0,
    explanation: '`/etc/passwd` lists local accounts (without password hashes on modern systems).',
  },
  {
    question: 'What is phishing?',
    options: [
      'A social engineering attempt to steal information',
      'A port scanning technique',
      'A disk encryption method',
      'A type of firewall rule',
    ],
    correct: 0,
    explanation: 'Phishing deceives people into revealing data or running malicious content.',
  },
  {
    question: 'Which of these is a safe way to store a CTF flag server-side?',
    options: [
      'A keyed HMAC hash',
      'A public Discord message',
      'A comment in the bot source code',
      'A plaintext field in an embed',
    ],
    correct: 0,
    explanation: 'A keyed hash verifies submissions without exposing the expected value.',
  },
  {
    question: 'What does DNS primarily do?',
    options: [
      'Resolve names to IP addresses',
      'Encrypt web traffic',
      'Store passwords',
      'Compile source code',
    ],
    correct: 0,
    explanation: 'DNS maps human-readable names to network addresses.',
  },
];

function shuffle(items, rng) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createQuiz({ rng = Math.random, count = 5 } = {}) {
  const selected = shuffle(QUESTIONS, rng).slice(0, Math.min(count, QUESTIONS.length));
  const state = { index: 0, correct: 0, total: selected.length, finished: false, feedback: null };

  function current() {
    return selected[state.index];
  }

  return {
    type: 'quiz',
    title: 'CYBERSECURITY QUIZ',
    submit(input) {
      if (state.finished) throw new Error('Quiz already finished.');
      const question = current();
      const index = Number(input);
      if (!Number.isInteger(index) || index < 0 || index >= question.options.length) {
        throw new Error('Select a valid answer.');
      }
      const isCorrect = index === question.correct;
      if (isCorrect) state.correct += 1;
      state.feedback = {
        correct: isCorrect,
        explanation: question.explanation,
        expected: question.options[question.correct],
      };
      state.index += 1;
      if (state.index >= state.total) state.finished = true;
      return {
        correct: isCorrect,
        finished: state.finished,
        feedback: state.feedback,
        score: state.correct,
        total: state.total,
      };
    },
    view() {
      if (state.finished) {
        return { kind: 'quiz', finished: true, score: state.correct, total: state.total };
      }
      const question = current();
      return {
        kind: 'quiz',
        finished: false,
        question: question.question,
        options: question.options,
        index: state.index,
        total: state.total,
        score: state.correct,
        feedback: state.feedback,
      };
    },
  };
}
