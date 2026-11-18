export type ChatIntent =
  | 'sales' | 'today' | 'weekly' | 'inventory' | 'returns'
  | 'customers' | 'promotion' | 'financial' | 'general'
  | 'ar_aging' | 'ap_aging' | 'payroll_cost' | 'cash_position' | 'budget_actual';

export const INTENT_PATTERNS: [ChatIntent, RegExp][] = [
  ['weekly',       /last.?week|letzte.?woche|diese.?woche|this.?week|\b7.?day|sieben.?tag|\bwoche\b/i],
  ['returns',      /\breturn\b|rückgabe|storno|gutschrift|\brefund\b|zurück|cancell|abbruch|credit.?note/i],
  ['customers',    /customer|kunde(?:n)?|wer.?kauft|top.?kund|who.?buy|käufer/i],
  ['promotion',    /promot|bewerb|empfeh|advertis|market|welches.?produkt|which.?product|\bpush\b|highlight/i],
  ['financial',    /profit|gewinn|\bkosten\b|expense|aufwand|cashflow|\bcash\b|bilanz|balance|ergebnis|result/i],
  ['inventory',    /\bstock\b|lager|bestand|nachbestell|reorder|vorrat|inventory|low.?stock|\bwenig\b|ausverkauf|verfügbar|auf.?lager/i],
  ['sales',        /\bsale|\bsell|sold|umsatz|revenue|verkauf|produkt|product|artikel|item|top.?sell|best.?sell|meistverkauf/i],
  ['ar_aging',     /offene.?forderung|forderungen|debitoren|ar.?aging|außenstände|wer.?schuldet|receivabl|überfällig.*forderung/i],
  ['ap_aging',     /offene.?verbindlichkeit|verbindlichkeiten|kreditoren|ap.?aging|schulden.?wir|payabl|lieferant.*überfall/i],
  ['payroll_cost', /personalkosten|lohnkosten|lohnaufwand|gehalt.?gesamt|payroll.?cost|labor.?cost|headcount.*kosten/i],
  ['cash_position',/kassenbestand|bankstand|liquidität|kontostand|bank.?balance|cash.?position|wie.?viel.?geld|runway|wie.?viel.*konto|\bbank\b|cash.?on.?hand|how.?much.?cash|cash.?account|cash.*bank|bank.*account|\bkasse\b/i],
  ['budget_actual',/\bbudget\b|plan.?ist|soll.?ist|budget.?vergleich|über.?budget|under.?budget|abweichung.*plan|budget.*abweich|variance/i],
];

export const VALID_INTENT_TAGS = new Set<ChatIntent>([
  'sales','today','weekly','inventory','financial','returns',
  'customers','ar_aging','ap_aging','payroll_cost','cash_position','budget_actual','general',
]);

export function classifyIntent(
  message: string,
  history: { role: string; content: string }[]
): Set<ChatIntent> {
  const combined = [message, ...history.slice(-2).map(h => h.content)].join(' ');
  const intents = new Set<ChatIntent>();
  for (const [intent, pattern] of INTENT_PATTERNS) {
    if (pattern.test(combined)) intents.add(intent);
  }
  if (intents.has('promotion'))    { intents.add('sales'); intents.add('inventory'); }
  if (intents.has('weekly'))       { intents.add('sales'); }
  if (intents.has('ar_aging'))     { intents.add('financial'); }
  if (intents.has('ap_aging'))     { intents.add('financial'); }
  if (intents.has('payroll_cost')) { intents.add('financial'); }
  if (intents.size === 0)          { intents.add('general'); }
  return intents;
}
