import { GameEngine } from './engine.js';
import { createQuiz } from './quiz.js';
import { createGuessCommand } from './guessCommand.js';
import { createDecrypt } from './decrypt.js';
import { createTerminal } from './terminal.js';

export function createGameEngine(options = {}) {
  const engine = new GameEngine(options);
  engine.register('quiz', createQuiz);
  engine.register('guesscommand', createGuessCommand);
  engine.register('decrypt', createDecrypt);
  engine.register('terminal', createTerminal);
  return engine;
}

export { GameEngine };
