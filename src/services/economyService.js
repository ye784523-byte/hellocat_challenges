import { SHOP_ITEMS } from '../constants/index.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const MAX_TRANSACTIONS = 100;
const MAX_REFS = 500;

export class EconomyService {
  constructor({ economyRepo, logger }) {
    this.economyRepo = economyRepo;
    this.logger = logger;
  }

  async getAccount(userId) {
    return this.economyRepo.ensure(userId);
  }

  async getBalance(userId) {
    const account = await this.getAccount(userId);
    return account.coins;
  }

  async credit(userId, amount, { reason = 'reward', ref = null, username } = {}) {
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0 || value > 1_000_000) {
      throw new ValidationError('Credit amount must be a positive integer.');
    }
    let result;
    await this.economyRepo.update(userId, (account) => {
      account.processedRefs ??= [];
      if (ref && account.processedRefs.includes(ref)) {
        result = { duplicate: true, credited: 0, account };
        return account;
      }
      account.coins += value;
      if (ref) account.processedRefs.push(ref);
      account.transactions ??= [];
      account.transactions.push({
        type: 'credit',
        amount: value,
        reason,
        ref,
        at: new Date().toISOString(),
      });
      if (account.transactions.length > MAX_TRANSACTIONS) {
        account.transactions = account.transactions.slice(-MAX_TRANSACTIONS);
      }
      if (account.processedRefs.length > MAX_REFS) {
        account.processedRefs = account.processedRefs.slice(-MAX_REFS);
      }
      result = { duplicate: false, credited: value, account };
      return account;
    });
    return result;
  }

  async debit(userId, amount, { reason = 'purchase', ref = null } = {}) {
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0 || value > 1_000_000) {
      throw new ValidationError('Debit amount must be a positive integer.');
    }
    let result;
    await this.economyRepo.update(userId, (account) => {
      account.processedRefs ??= [];
      if (ref && account.processedRefs.includes(ref)) {
        result = { duplicate: true, debited: 0, account };
        return account;
      }
      if (account.coins < value) {
        throw new ValidationError(
          `Insufficient ${'CATCOINS'}: you need ${value - account.coins} more.`,
        );
      }
      account.coins -= value;
      if (ref) account.processedRefs.push(ref);
      account.transactions ??= [];
      account.transactions.push({
        type: 'debit',
        amount: value,
        reason,
        ref,
        at: new Date().toISOString(),
      });
      if (account.transactions.length > MAX_TRANSACTIONS) {
        account.transactions = account.transactions.slice(-MAX_TRANSACTIONS);
      }
      if (account.processedRefs.length > MAX_REFS) {
        account.processedRefs = account.processedRefs.slice(-MAX_REFS);
      }
      result = { duplicate: false, debited: value, account };
      return account;
    });
    return result;
  }

  async purchase(userId, itemId) {
    const item = SHOP_ITEMS.find((entry) => entry.id === itemId);
    if (!item) throw new NotFoundError('That shop item does not exist.');
    let result;
    await this.economyRepo.update(userId, (account) => {
      account.inventory ??= [];
      if (account.inventory.some((entry) => entry.itemId === item.id)) {
        throw new ValidationError('You already own this cosmetic item.');
      }
      if (account.coins < item.price) {
        throw new ValidationError(
          `Insufficient CATCOINS: you need ${item.price - account.coins} more.`,
        );
      }
      account.coins -= item.price;
      account.inventory.push({
        itemId: item.id,
        name: item.name,
        type: item.type,
        cosmetic: item.cosmetic,
        purchasedAt: new Date().toISOString(),
      });
      account.transactions ??= [];
      account.transactions.push({
        type: 'purchase',
        amount: item.price,
        reason: item.name,
        ref: `shop:${item.id}`,
        at: new Date().toISOString(),
      });
      if (account.transactions.length > MAX_TRANSACTIONS) {
        account.transactions = account.transactions.slice(-MAX_TRANSACTIONS);
      }
      result = { item, account };
      return account;
    });
    return result;
  }

  async inventory(userId) {
    const account = await this.getAccount(userId);
    return account.inventory ?? [];
  }

  async transactions(userId, limit = 10) {
    const account = await this.getAccount(userId);
    return (account.transactions ?? []).slice(-limit).reverse();
  }

  async richest(limit = 10) {
    const accounts = await this.economyRepo.all();
    return accounts.slice().sort((a, b) => b.coins - a.coins).slice(0, limit);
  }
}
