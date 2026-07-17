import { AccountType } from '@prisma/client';

/**
 * Well-known account codes the posting engine resolves by `Account.code`.
 * Keeping them here (rather than hard-coding ids) lets the seed create the
 * chart of accounts and the services look accounts up by a stable code.
 */
export const ACCOUNT_CODES = {
  BANK: '1100', // default bank leg = ABA Business Account (VAT)
  BANK_BUSINESS: '1100', // ABA Business Account (VAT 10%)
  BANK_PERSONAL: '1110', // ABA Personal Account (no tax)
  ACCOUNTS_RECEIVABLE: '1200', // A/R
  PREPAID_EXPENSES: '1400',
  ACCOUNTS_PAYABLE: '2100', // A/P
  DEPOSITS_HELD: '2200', // Customer/Supplier deposits
  VAT_PAYABLE: '2300', // Output VAT collected on invoices
  OPERATION_REVENUE: '4001',
  COSTING_EXPENSE: '5001', // default expense leg for B/L costing cost lines
} as const;

/**
 * Normal balance sign per account type. A debit increases ASSET/EXPENSE/BANK
 * balances and decreases the rest; a credit does the opposite. `applyEntry`
 * uses this to move `Account.balance` in the correct direction.
 */
export function balanceDelta(
  type: AccountType,
  entryType: 'DEBIT' | 'CREDIT',
  amount: number,
): number {
  const debitPositive =
    type === AccountType.ASSET ||
    type === AccountType.EXPENSE ||
    type === AccountType.BANK;
  const sign = entryType === 'DEBIT' ? 1 : -1;
  return (debitPositive ? sign : -sign) * amount;
}
