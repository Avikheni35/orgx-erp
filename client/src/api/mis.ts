import apiClient from './client';

export interface MISSummary {
  year: number;
  revenueYTD: number;
  expensesYTD: number;
  netResultYTD: number;
  cashBalance: number;
  openAR: number;
  openAP: number;
  overdueARCount: number;
  overdueARAmount: number;
  payrollYTD: number;
  payrollRatio: number;
  invoiceStatusCounts: { draft: number; sent: number; paid: number; cancelled: number };
}

export interface MonthlyDataPoint {
  month: number;
  label: string;
  amount: number;
  count: number;
}

export interface MonthlyData {
  year: number;
  months: MonthlyDataPoint[];
}

export interface CashflowDataPoint {
  month: number;
  label: string;
  receipts: number;
  payments: number;
  net: number;
}

export interface CashflowData {
  year: number;
  months: CashflowDataPoint[];
}

export interface PayrollDataPoint {
  month: number;
  label: string;
  gross: number;
  net: number;
  employeeCount: number;
}

export interface PayrollMonthlyData {
  year: number;
  months: PayrollDataPoint[];
}

export interface TopCustomer {
  customerId: string;
  companyName: string;
  total: number;
  invoiceCount: number;
}

export interface TopCustomersData {
  customers: TopCustomer[];
}

export interface TopSupplier {
  supplierId: string;
  companyName: string;
  total: number;
  invoiceCount: number;
}

export interface TopSuppliersData {
  suppliers: TopSupplier[];
}

export interface VatDataPoint {
  month: number;
  label: string;
  ust: number;
  vst: number;
  net: number;
}

export interface VatMonthlyData {
  year: number;
  months: VatDataPoint[];
}

export interface ProfitDataPoint {
  month: number;
  label: string;
  revenue: number;
  expenses: number;
  net: number;
}

export interface ProfitMonthlyData {
  year: number;
  months: ProfitDataPoint[];
}

export type SuggestionType = 'opportunity' | 'warning' | 'reorder' | 'growth' | 'promotion';
export type SuggestionPriority = 'high' | 'medium' | 'low';

export interface AISuggestion {
  type: SuggestionType;
  priority: SuggestionPriority;
  title: string;
  body: string;
  metric?: string;
}

export interface AIAdvisorData {
  suggestions: AISuggestion[];
}

export const misApi = {
  summary:         (year: number) =>
    apiClient.get<MISSummary>(`/mis/summary?year=${year}`),
  revenueMonthly:  (year: number) =>
    apiClient.get<MonthlyData>(`/mis/revenue/monthly?year=${year}`),
  expensesMonthly: (year: number) =>
    apiClient.get<MonthlyData>(`/mis/expenses/monthly?year=${year}`),
  cashflowMonthly: (year: number) =>
    apiClient.get<CashflowData>(`/mis/cashflow/monthly?year=${year}`),
  payrollMonthly:  (year: number) =>
    apiClient.get<PayrollMonthlyData>(`/mis/payroll/monthly?year=${year}`),
  topCustomers:    (year: number, limit = 10) =>
    apiClient.get<TopCustomersData>(`/mis/customers/top?year=${year}&limit=${limit}`),
  topSuppliers:    (year: number, limit = 10) =>
    apiClient.get<TopSuppliersData>(`/mis/suppliers/top?year=${year}&limit=${limit}`),
  vatMonthly:      (year: number) =>
    apiClient.get<VatMonthlyData>(`/mis/vat/monthly?year=${year}`),
  profitMonthly:   (year: number) =>
    apiClient.get<ProfitMonthlyData>(`/mis/profit/monthly?year=${year}`),
  aiAdvisor: () =>
    apiClient.get<AIAdvisorData>('/mis/ai-advisor'),
  aiChat: (message: string, history: { role: 'user' | 'assistant'; content: string }[]) =>
    apiClient.post<{ reply: string }>('/mis/chat', { message, history }),
};
