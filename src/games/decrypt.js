const PHRASES = [
  'trust but verify',
  'least privilege wins',
  'defense in depth',
  'patch early patch often',
  'assume breach',
  'verify integrity first',
  'knowledge is the exploit',
  'the quiet packet speaks',
];

function normalize(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function caesar(text, shift) {
  return text.replace(/[a-z]/gi, (char) => {
    const base = char === char.toLowerCase() ? 97 : 65;
    return String.fromCharCode(((char.charCodeAt(0) - base + shift + 26) % 26) + base);
  });
}

function atbash(text) {
  return text.replace(/[a-z]/gi, (char) => {
    const base = char === char.toLowerCase() ? 97 : 65;
    return String.fromCharCode(base + (25 - (char.charCodeAt(0) - base)));
  });
}

function reverse(text) {
  return [...text].reverse().join('');
}

function hexEncode(text) {
  return [...text].map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
}

const METHODS = [
  {
    id: 'caesar',
    name: 'Caesar shift',
    clue: 'Each letter was shifted forward in the alphabet by a fixed amount.',
    build(phrase, rng) {
      const shift = 3 + Math.floor(rng() * 10);
      return { encoded: caesar(phrase, shift), extra: `Shift is not disclosed. Brute-force the 26 possibilities.` };
    },
  },
  {
    id: 'rot13',
    name: 'ROT13',
    clue: 'A classic 13-position alphabetic rotation.',
    build(phrase) {
      return { encoded: caesar(phrase, 13), extra: 'Apply ROT13 twice to reverse it.' };
    },
  },
  {
    id: 'atbash',
    name: 'Atbash',
    clue: 'The alphabet was mirrored: A becomes Z, B becomes Y, and so on.',
    build(phrase) {
      return { encoded: atbash(phrase), extra: 'Mirror the alphabet to decode.' };
    },
  },
  {
    id: 'reverse',
    name: 'Reversal',
    clue: 'The characters were written in reverse order.',
    build(phrase) {
      return { encoded: reverse(phrase), extra: 'Read it backwards.' };
    },
  },
  {
    id: 'hex',
    name: 'Hexadecimal encoding',
    clue: 'Each byte was encoded as a two-digit hexadecimal value.',
    build(phrase) {
      return { encoded: hexEncode(phrase), extra: 'Convert each hex byte to ASCII.' };
    },
  },
];

export function createDecrypt({ rng = Math.random } = {}) {
  const phrase = PHRASES[Math.floor(rng() * PHRASES.length)];
  const method = METHODS[Math.floor(rng() * METHODS.length)];
  const { encoded, extra } = method.build(phrase, rng);
  let finished = false;
  let attempts = 0;

  return {
    type: 'decrypt',
    title: 'CRYPTOGRAPHY DRILL',
    submit(input) {
      if (finished) throw new Error('This drill is already complete.');
      attempts += 1;
      if (attempts > 5) {
        finished = true;
        return {
          correct: false,
          finished: true,
          feedback: { expected: phrase, message: 'Attempt limit reached.' },
        };
      }
      const correct = normalize(input) === normalize(phrase);
      if (correct) finished = true;
      return {
        correct,
        finished,
        feedback: {
          expected: correct || finished ? phrase : undefined,
          message: correct ? 'Decryption verified.' : 'That plaintext does not match.',
          attemptsRemaining: Math.max(0, 5 - attempts),
        },
      };
    },
    view() {
      return {
        kind: 'decrypt',
        finished,
        method: method.name,
        clue: method.clue,
        extra,
        encoded,
        attempts,
        expected: finished ? phrase : undefined,
      };
    },
  };
}
