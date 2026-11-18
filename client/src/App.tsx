import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import { useAuthStore } from './stores/authStore';
import { authApi } from './api/auth';
import apiClient, { setApiToken } from './api/client';
import ProtectedRoute from './components/ProtectedRoute';
import ErpLayout from './layouts/ErpLayout';
import OpsLayout from './layouts/OpsLayout';
import OpsSalesPage    from './pages/ops/OpsSalesPage';

import OpsCashPage     from './pages/ops/OpsCashPage';
import OpsStockPage    from './pages/ops/OpsStockPage';
import OpsDaybookPage  from './pages/ops/OpsDaybookPage';

import LoginPage from './pages/auth/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import MaintenancePage from './pages/MaintenancePage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import PublicInvoicePage from './pages/public/PublicInvoicePage';
import ImpressumPage from './pages/legal/ImpressumPage';
import DatenschutzPage from './pages/legal/DatenschutzPage';
import AgbPage from './pages/legal/AgbPage';

import ErpDashboardPage from './pages/erp/DashboardPage';
import CompanySettingsPage from './pages/erp/settings/CompanySettingsPage';
import FeatureSettingsPage from './pages/erp/settings/FeatureSettingsPage';
import AccountListPage from './pages/erp/accounts/AccountListPage';
import CreateAccountPage from './pages/erp/accounts/CreateAccountPage';
import AccountDetailPage from './pages/erp/accounts/AccountDetailPage';
import FiscalYearsPage from './pages/erp/fiscalYears/FiscalYearsPage';
import JournalListPage from './pages/erp/journal/JournalListPage';
import CreateJournalEntryPage from './pages/erp/journal/CreateJournalEntryPage';
import JournalEntryDetailPage from './pages/erp/journal/JournalEntryDetailPage';
import LanguageSettingsPage from './pages/erp/settings/LanguageSettingsPage';
import UserManagementPage from './pages/erp/settings/UserManagementPage';
import UserProfilePage from './pages/erp/settings/UserProfilePage';
import ServiceCatalogPage from './pages/erp/settings/ServiceCatalogPage';
import CatalogPage from './pages/erp/catalog/CatalogPage';
import CustomerListPage from './pages/erp/customers/CustomerListPage';
import CreateCustomerPage from './pages/erp/customers/CreateCustomerPage';
import CustomerDetailPage from './pages/erp/customers/CustomerDetailPage';
import SupplierListPage from './pages/erp/suppliers/SupplierListPage';
import CreateSupplierPage from './pages/erp/suppliers/CreateSupplierPage';
import SupplierDetailPage from './pages/erp/suppliers/SupplierDetailPage';
import SalesInvoiceListPage from './pages/erp/salesInvoices/SalesInvoiceListPage';
import CreateSalesInvoicePage from './pages/erp/salesInvoices/CreateSalesInvoicePage';
import SalesInvoiceDetailPage from './pages/erp/salesInvoices/SalesInvoiceDetailPage';
import VendorInvoiceListPage from './pages/erp/vendorInvoices/VendorInvoiceListPage';
import CreateVendorInvoicePage from './pages/erp/vendorInvoices/CreateVendorInvoicePage';
import VendorInvoiceDetailPage from './pages/erp/vendorInvoices/VendorInvoiceDetailPage';
import ApprovalsPage from './pages/erp/vendorInvoices/ApprovalsPage';
import InventoryPage from './pages/erp/inventory/InventoryPage';
import InventoryItemDetailPage from './pages/erp/inventory/InventoryItemDetailPage';
import ProductsPage from './pages/erp/products/ProductsPage';
import ProductDetailPage from './pages/erp/products/ProductDetailPage';
import PriceListsPage from './pages/erp/products/PriceListsPage';
import SusaPage from './pages/erp/reports/SusaPage';
import BwaPage from './pages/erp/reports/BwaPage';
import GuvPage from './pages/erp/reports/GuvPage';
import OpenItemsDebtorsPage from './pages/erp/reports/OpenItemsDebtorsPage';
import OpenItemsCreditorsPage from './pages/erp/reports/OpenItemsCreditorsPage';
import BilanzPage from './pages/erp/reports/BilanzPage';
import UstPage from './pages/erp/reports/UstPage';
import PaymentListPage from './pages/erp/payments/PaymentListPage';
import CreatePaymentPage from './pages/erp/payments/CreatePaymentPage';
import PaymentDetailPage from './pages/erp/payments/PaymentDetailPage';
import CashBookPage from './pages/erp/cashbook/CashBookPage';
import ExpensesPage from './pages/erp/expenses/ExpensesPage';
import DatevExportPage from './pages/erp/reports/DatevExportPage';
import AssetListPage from './pages/erp/assets/AssetListPage';
import CreateAssetPage from './pages/erp/assets/CreateAssetPage';
import AssetDetailPage from './pages/erp/assets/AssetDetailPage';
import DepreciationRunPage from './pages/erp/assets/DepreciationRunPage';
import CostCenterListPage from './pages/erp/costcenters/CostCenterListPage';
import CostCenterDetailPage from './pages/erp/costcenters/CostCenterDetailPage';
import EmployeeListPage from './pages/erp/employees/EmployeeListPage';
import CreateEmployeePage from './pages/erp/employees/CreateEmployeePage';
import EmployeeDetailPage from './pages/erp/employees/EmployeeDetailPage';
import TravelExpenseListPage from './pages/erp/travelExpenses/TravelExpenseListPage';
import CreateTravelExpensePage from './pages/erp/travelExpenses/CreateTravelExpensePage';
import TravelExpenseDetailPage from './pages/erp/travelExpenses/TravelExpenseDetailPage';
import SalesQuoteListPage from './pages/erp/salesQuotes/SalesQuoteListPage';
import CreateSalesQuotePage from './pages/erp/salesQuotes/CreateSalesQuotePage';
import SalesQuoteDetailPage from './pages/erp/salesQuotes/SalesQuoteDetailPage';
import SalesOrderListPage from './pages/erp/salesOrders/SalesOrderListPage';
import CreateSalesOrderPage from './pages/erp/salesOrders/CreateSalesOrderPage';
import SalesOrderDetailPage from './pages/erp/salesOrders/SalesOrderDetailPage';
import AbsencesPage from './pages/erp/absences/AbsencesPage';
import NotificationsPage from './pages/erp/notifications/NotificationsPage';
import ReportsIndexPage from './pages/erp/reports/ReportsIndexPage';
import BankAccountsPage from './pages/erp/settings/BankAccountsPage';
import FxRatesPage from './pages/erp/settings/FxRatesPage';
import IntegrationsPage from './pages/erp/settings/IntegrationsPage';
import OpeningBalancesPage from './pages/erp/settings/OpeningBalancesPage';
import ElsterPage from './pages/erp/elster/ElsterPage';
import ElsterDetailPage from './pages/erp/elster/ElsterDetailPage';
import DirectDebitPage from './pages/erp/directDebits/DirectDebitPage';
import CreateMandatePage from './pages/erp/directDebits/CreateMandatePage';
import MandateDetailPage from './pages/erp/directDebits/MandateDetailPage';
import CreateRunPage from './pages/erp/directDebits/CreateRunPage';
import RunDetailPage from './pages/erp/directDebits/RunDetailPage';
import AccrualListPage from './pages/erp/accruals/AccrualListPage';
import CreateAccrualPage from './pages/erp/accruals/CreateAccrualPage';
import AccrualDetailPage from './pages/erp/accruals/AccrualDetailPage';
import CreditNoteListPage from './pages/erp/creditNotes/CreditNoteListPage';
import CreateCreditNotePage from './pages/erp/creditNotes/CreateCreditNotePage';
import CreditNoteDetailPage from './pages/erp/creditNotes/CreditNoteDetailPage';
import PurchaseOrderListPage from './pages/erp/purchaseOrders/PurchaseOrderListPage';
import CreatePurchaseOrderPage from './pages/erp/purchaseOrders/CreatePurchaseOrderPage';
import PurchaseOrderDetailPage from './pages/erp/purchaseOrders/PurchaseOrderDetailPage';
import CashBookReportPage from './pages/erp/cashbook/CashBookReportPage';
import BankStatementPage from './pages/erp/cashbook/BankStatementPage';
import BankReconciliationPage from './pages/erp/payments/BankReconciliationPage';
import PayrollListPage from './pages/erp/payroll/PayrollListPage';
import CreatePayrollPage from './pages/erp/payroll/CreatePayrollPage';
import PayrollDetailPage from './pages/erp/payroll/PayrollDetailPage';
import EventStaffPayrollPage from './pages/erp/payroll/EventStaffPayrollPage';
import MISDashboardPage from './pages/erp/mis/MISDashboardPage';
import MISRevenuePage from './pages/erp/mis/MISRevenuePage';
import MISCostPage from './pages/erp/mis/MISCostPage';
import MISCashflowPage from './pages/erp/mis/MISCashflowPage';
import MISPayrollPage from './pages/erp/mis/MISPayrollPage';
import MISTaxPage from './pages/erp/mis/MISTaxPage';
import DunningPage from './pages/erp/dunning/DunningPage';
import RecurringInvoicesPage from './pages/erp/recurringInvoices/RecurringInvoicesPage';
import RecurringInvoiceFormPage from './pages/erp/recurringInvoices/RecurringInvoiceFormPage';
import BudgetPlanPage from './pages/erp/budgets/BudgetPlanPage';
import BudgetVariancePage from './pages/erp/budgets/BudgetVariancePage';
import CostCenterVariancePage from './pages/erp/costcenters/CostCenterVariancePage';
import { portalHome, type M3UserRole } from './types';

function RootRedirect() {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  return <Navigate to={portalHome(user.role as M3UserRole)} replace />;
}

const ERP_ROLES = ['super_admin', 'erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor', 'agency_admin', 'disponent'] as const;

export default function App() {
  const { isInitializing, setAuth, setInitialized } = useAuthStore();
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      try {
        const { data } = await apiClient.post<{ accessToken: string }>('/auth/refresh');
        setApiToken(data.accessToken);
        const user = await authApi.me();
        useAuthStore.setState({ user, accessToken: data.accessToken, isAuthenticated: true, isInitializing: false });
      } catch {
        setInitialized();
      }
    })();
  }, [setAuth, setInitialized]);

  if (isInitializing) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><CircularProgress /></Box>;
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/impressum" element={<ImpressumPage />} />
      <Route path="/datenschutz" element={<DatenschutzPage />} />
      <Route path="/agb" element={<AgbPage />} />

      {/* ERP portal */}
      <Route element={<ProtectedRoute roles={[...ERP_ROLES]} />}>
        <Route path="/erp" element={<ErpLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ErpDashboardPage />} />

          {/* Buchführung / Journal — static sub-routes before /:id */}
          <Route path="buchfuehrung" element={<JournalListPage />} />
          <Route path="buchfuehrung/new" element={<CreateJournalEntryPage />} />
          <Route path="buchfuehrung/abgrenzungen" element={<AccrualListPage />} />
          <Route path="buchfuehrung/abgrenzungen/new" element={<CreateAccrualPage />} />
          <Route path="buchfuehrung/abgrenzungen/:id" element={<AccrualDetailPage />} />
          <Route path="buchfuehrung/:id" element={<JournalEntryDetailPage />} />

          {/* Kassenbuch */}
          <Route path="kasse" element={<CashBookPage />} />
          <Route path="kasse/bericht" element={<CashBookReportPage />} />

          {/* Ausgaben & Einnahmen */}
          <Route path="ausgaben" element={<ExpensesPage />} />

          {/* Kunden */}
          <Route path="kunden" element={<CustomerListPage />} />
          <Route path="kunden/new" element={<CreateCustomerPage />} />
          <Route path="kunden/:id" element={<CustomerDetailPage />} />

          {/* Artikelkatalog */}
          <Route path="katalog" element={<CatalogPage />} />

          {/* Lieferanten */}
          <Route path="lieferanten" element={<SupplierListPage />} />
          <Route path="lieferanten/new" element={<CreateSupplierPage />} />
          <Route path="lieferanten/:id" element={<SupplierDetailPage />} />

          {/* Verkauf */}
          <Route path="verkauf/angebote" element={<SalesQuoteListPage />} />
          <Route path="verkauf/angebote/new" element={<CreateSalesQuotePage />} />
          <Route path="verkauf/angebote/:id" element={<SalesQuoteDetailPage />} />
          <Route path="verkauf/auftraege" element={<SalesOrderListPage />} />
          <Route path="verkauf/auftraege/new" element={<CreateSalesOrderPage />} />
          <Route path="verkauf/auftraege/:id" element={<SalesOrderDetailPage />} />
          <Route path="verkauf/rechnungen" element={<SalesInvoiceListPage />} />
          <Route path="verkauf/rechnungen/new" element={<CreateSalesInvoicePage />} />
          <Route path="verkauf/rechnungen/:id" element={<SalesInvoiceDetailPage />} />
          <Route path="verkauf/gutschriften" element={<CreditNoteListPage />} />
          <Route path="verkauf/gutschriften/new" element={<CreateCreditNotePage />} />
          <Route path="verkauf/gutschriften/:id" element={<CreditNoteDetailPage />} />
          {/* Budgetplanung */}
          <Route path="budget" element={<BudgetPlanPage />} />
          <Route path="budget/abweichung" element={<BudgetVariancePage />} />

          <Route path="mahnwesen" element={<DunningPage />} />
          <Route path="wiederkehrend" element={<RecurringInvoicesPage />} />
          <Route path="wiederkehrend/neu" element={<RecurringInvoiceFormPage />} />
          <Route path="wiederkehrend/:id/bearbeiten" element={<RecurringInvoiceFormPage />} />

          {/* Einkauf — static sub-routes before /:id */}
          <Route path="einkauf/bestellungen" element={<PurchaseOrderListPage />} />
          <Route path="einkauf/bestellungen/new" element={<CreatePurchaseOrderPage />} />
          <Route path="einkauf/bestellungen/:id" element={<PurchaseOrderDetailPage />} />
          <Route path="einkauf/eingangsrechnungen" element={<VendorInvoiceListPage />} />
          <Route path="einkauf/eingangsrechnungen/new" element={<CreateVendorInvoicePage />} />
          <Route path="einkauf/eingangsrechnungen/:id" element={<VendorInvoiceDetailPage />} />
          <Route path="genehmigungen" element={<ApprovalsPage />} />

          {/* Produkte & Preislisten */}
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/:id" element={<ProductDetailPage />} />
          <Route path="price-lists" element={<PriceListsPage />} />
          {/* Lagerverwaltung */}
          <Route path="lager" element={<InventoryPage />} />
          <Route path="lager/:id" element={<InventoryItemDetailPage />} />

          {/* Zahlungen — static sub-routes before /:id */}
          <Route path="zahlungen" element={<PaymentListPage />} />
          <Route path="zahlungen/new" element={<CreatePaymentPage />} />
          <Route path="zahlungen/kontoauszug" element={<BankStatementPage />} />
          <Route path="zahlungen/abstimmung" element={<BankReconciliationPage />} />
          <Route path="zahlungen/lastschrift" element={<DirectDebitPage />} />
          <Route path="zahlungen/lastschrift/mandate/new" element={<CreateMandatePage />} />
          <Route path="zahlungen/lastschrift/mandate/:id" element={<MandateDetailPage />} />
          <Route path="zahlungen/lastschrift/runs/new" element={<CreateRunPage />} />
          <Route path="zahlungen/lastschrift/runs/:id" element={<RunDetailPage />} />
          <Route path="zahlungen/:id" element={<PaymentDetailPage />} />

          {/* Steuer */}
          <Route path="steuer/ustvavorschau" element={<UstPage />} />
          <Route path="steuer/elster" element={<ElsterPage />} />
          <Route path="steuer/elster/:id" element={<ElsterDetailPage />} />

          {/* Berichte */}
          <Route path="berichte" element={<ReportsIndexPage />} />
          <Route path="berichte/susa" element={<SusaPage />} />
          <Route path="berichte/guv" element={<GuvPage />} />
          <Route path="berichte/bilanz" element={<BilanzPage />} />
          <Route path="berichte/bwa" element={<BwaPage />} />
          <Route path="berichte/offene-posten-debitoren" element={<OpenItemsDebtorsPage />} />
          <Route path="berichte/offene-posten-kreditoren" element={<OpenItemsCreditorsPage />} />
          <Route path="berichte/datev-export" element={<DatevExportPage />} />

          {/* MIS / Controlling */}
          <Route path="mis"          element={<MISDashboardPage />} />
          <Route path="mis/umsatz"   element={<MISRevenuePage />} />
          <Route path="mis/kosten"   element={<MISCostPage />} />
          <Route path="mis/cashflow" element={<MISCashflowPage />} />
          <Route path="mis/lohn"     element={<MISPayrollPage />} />
          <Route path="mis/steuer"   element={<MISTaxPage />} />

          {/* Mitarbeiter — static routes before /:id */}
          <Route path="mitarbeiter" element={<EmployeeListPage />} />
          <Route path="mitarbeiter/new" element={<CreateEmployeePage />} />
          <Route path="mitarbeiter/abwesenheiten" element={<AbsencesPage />} />
          <Route path="mitarbeiter/:id" element={<EmployeeDetailPage />} />
          <Route path="reisekosten" element={<TravelExpenseListPage />} />
          <Route path="reisekosten/new" element={<CreateTravelExpensePage />} />
          <Route path="reisekosten/:id" element={<TravelExpenseDetailPage />} />
          <Route path="lohn" element={<PayrollListPage />} />
          <Route path="lohn/new" element={<CreatePayrollPage />} />
          <Route path="lohn/event-staff" element={<EventStaffPayrollPage />} />
          <Route path="lohn/:id" element={<PayrollDetailPage />} />

          {/* Anlagen — static sub-routes MUST come before /:id */}
          <Route path="anlagen" element={<AssetListPage />} />
          <Route path="anlagen/new" element={<CreateAssetPage />} />
          <Route path="anlagen/abschreibungslauf" element={<DepreciationRunPage />} />
          <Route path="anlagen/:id" element={<AssetDetailPage />} />

          {/* Kontenplan */}
          <Route path="accounts" element={<AccountListPage />} />
          <Route path="accounts/new" element={<CreateAccountPage />} />
          <Route path="accounts/:id" element={<AccountDetailPage />} />

          {/* Kostenstellen */}
          <Route path="kostenstellen" element={<CostCenterListPage />} />
          <Route path="kostenstellen/:id" element={<CostCenterDetailPage />} />
          <Route path="kostenstellen/abweichung" element={<CostCenterVariancePage />} />

          {/* Benachrichtigungen */}
          <Route path="benachrichtigungen" element={<NotificationsPage />} />

          {/* Einstellungen */}
          <Route path="einstellungen/unternehmen" element={<CompanySettingsPage />} />
          <Route path="einstellungen/features" element={<FeatureSettingsPage />} />
          <Route path="einstellungen/geschaeftsjahre" element={<FiscalYearsPage />} />
          <Route path="einstellungen/sprache" element={<LanguageSettingsPage />} />
          <Route path="einstellungen/benutzer" element={<UserManagementPage />} />
          <Route path="einstellungen/profil" element={<UserProfilePage />} />
          <Route path="einstellungen/leistungen" element={<ServiceCatalogPage />} />
          <Route path="einstellungen/bankkonten" element={<BankAccountsPage />} />
          <Route path="einstellungen/wechselkurse" element={<FxRatesPage />} />
          <Route path="einstellungen/integrationen" element={<IntegrationsPage />} />
          <Route path="einstellungen/eroeffnungssalden" element={<OpeningBalancesPage />} />
        </Route>
      </Route>

      {/* Ops portal — erp_employee + admins */}
      <Route element={<ProtectedRoute roles={['erp_employee', 'erp_admin', 'erp_accountant']} />}>
        <Route path="/ops" element={<OpsLayout />}>
          <Route index element={<Navigate to="sales" replace />} />
          <Route path="sales"    element={<OpsSalesPage />} />

          <Route path="cash"     element={<OpsCashPage />} />
          <Route path="stock"    element={<OpsStockPage />} />
          <Route path="daybook"  element={<OpsDaybookPage />} />
        </Route>
      </Route>

      <Route path="/maintenance" element={<MaintenancePage />} />
      <Route path="/erp/public/invoice/:token" element={<PublicInvoicePage />} />
      <Route path="/403" element={<UnauthorizedPage />} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
