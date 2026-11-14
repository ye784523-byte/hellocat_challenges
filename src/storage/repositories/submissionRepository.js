import crypto from 'node:crypto';

export function emptySubmissions() {
  return { submissions: [] };
}

export function validateSubmissions(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.submissions)) {
    return 'expected { submissions: array }';
  }
  for (const entry of data.submissions) {
    if (!entry.userId || !entry.challengeId || typeof entry.correct !== 'boolean') {
      return 'invalid submission entry';
    }
  }
  return true;
}

export class SubmissionRepository {
  constructor(store) {
    this.store = store;
  }

  async add(entry) {
    const submission = {
      id: `SUB-${crypto.randomBytes(6).toString('hex')}`,
      userId: entry.userId,
      challengeId: entry.challengeId,
      correct: Boolean(entry.correct),
      attemptNumber: entry.attemptNumber ?? 1,
      hintUsed: Boolean(entry.hintUsed),
      createdAt: new Date().toISOString(),
    };
    await this.store.update((current) => {
      current.submissions.push(submission);
      return current;
    });
    return submission;
  }

  async all() {
    const data = await this.store.read();
    return data.submissions;
  }

  async byUser(userId) {
    const data = await this.store.read();
    return data.submissions.filter((entry) => entry.userId === userId);
  }

  async byChallenge(challengeId) {
    const data = await this.store.read();
    return data.submissions.filter((entry) => entry.challengeId === challengeId);
  }

  async solved(userId, challengeId) {
    const data = await this.store.read();
    return data.submissions.some(
      (entry) => entry.userId === userId && entry.challengeId === challengeId && entry.correct,
    );
  }

  async attempts(userId, challengeId) {
    const data = await this.store.read();
    return data.submissions.filter(
      (entry) => entry.userId === userId && entry.challengeId === challengeId,
    ).length;
  }

  async solvedChallengeIds(userId) {
    const data = await this.store.read();
    return [...new Set(
      data.submissions
        .filter((entry) => entry.userId === userId && entry.correct)
        .map((entry) => entry.challengeId),
    )];
  }

  async solvedCount() {
    const data = await this.store.read();
    return data.submissions.filter((entry) => entry.correct).length;
  }

  async deleteByUser(userId) {
    let removed = 0;
    await this.store.update((current) => {
      const before = current.submissions.length;
      current.submissions = current.submissions.filter((entry) => entry.userId !== userId);
      removed = before - current.submissions.length;
      return current;
    });
    return removed;
  }

  async deleteByChallenge(challengeId) {
    let removed = 0;
    await this.store.update((current) => {
      const before = current.submissions.length;
      current.submissions = current.submissions.filter((entry) => entry.challengeId !== challengeId);
      removed = before - current.submissions.length;
      return current;
    });
    return removed;
  }
}
