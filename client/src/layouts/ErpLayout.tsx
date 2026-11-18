import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import MISChatWidget from '../pages/erp/mis/MISChatWidget';
import { APP_ERP } from '@/config/brand';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Collapse, Typography, Divider, IconButton, Avatar, Menu, MenuItem,
  Tooltip, Badge, Switch,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BookIcon from '@mui/icons-material/Book';
import PeopleIcon from '@mui/icons-material/People';
import CategoryIcon from '@mui/icons-material/Category';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PaymentsIcon from '@mui/icons-material/Payments';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import BarChartIcon from '@mui/icons-material/BarChart';
import BadgeIcon from '@mui/icons-material/Badge';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import SettingsIcon from '@mui/icons-material/Settings';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import NotificationsIcon from '@mui/icons-material/Notifications';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LogoutIcon from '@mui/icons-material/Logout';
import LanguageIcon from '@mui/icons-material/Language';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../api/auth';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications';
import { inventoryApi } from '../api/inventory';

const DRAWER_FULL = 256;
const DRAWER_MINI = 64;

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: { label: string; path: string; exact?: boolean }[];
  daily?: boolean; // true = shown in basic view; false/absent = advanced only
}

export default function ErpLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { t, i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Let MUI modals/dialogs/drawers/menus handle Escape themselves
      if (document.querySelector('.MuiModal-root')) return;
      // Don't navigate back when user is typing
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Don't navigate back from root pages that have no parent
      if (location.pathname === '/erp/dashboard') return;
      navigate(-1);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [navigate, location.pathname]);
  const [advanced, setAdvanced] = useState(() => localStorage.getItem('erp-advanced') === 'true');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ accounting: true });
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const NAV: NavItem[] = [
    { key: 'dashboard', label: t('nav.dashboard'), icon: <DashboardIcon />, path: '/erp/dashboard', daily: true },
    {
      key: 'accounting', label: t('nav.accounting'), icon: <BookIcon />, daily: true,
      children: [
        { label: t('nav.journalEntries'), path: '/erp/buchfuehrung', exact: true },
        { label: t('nav.accruals'),       path: '/erp/buchfuehrung/abgrenzungen' },
        { label: t('nav.cashBook'),       path: '/erp/kasse' },
        { label: t('nav.arAging'),        path: '/erp/berichte/offene-posten-debitoren' },
        { label: t('nav.apAging'),        path: '/erp/berichte/offene-posten-kreditoren' },
      ],
    },
    { key: 'customers',  label: t('nav.customers'),  icon: <PeopleIcon />,         path: '/erp/kunden',     daily: true },
    {
      key: 'sales', label: t('nav.sales'), icon: <ReceiptIcon />, daily: true,
      children: [
        { label: t('nav.quotes'),      path: '/erp/verkauf/angebote' },
        { label: t('nav.orders'),      path: '/erp/verkauf/auftraege' },
        { label: t('nav.invoices'),    path: '/erp/verkauf/rechnungen' },
        { label: t('nav.creditNotes'), path: '/erp/verkauf/gutschriften' },
        { label: t('nav.dunningNav'),      path: '/erp/mahnwesen' },
        { label: t('nav.recurringInvoices'), path: '/erp/wiederkehrend' },
      ],
    },
    {
      key: 'purchasing', label: t('nav.purchasing'), icon: <ShoppingCartIcon />, daily: true,
      children: [
        { label: t('nav.purchaseOrders'), path: '/erp/einkauf/bestellungen' },
        { label: t('nav.vendorInvoices'), path: '/erp/einkauf/eingangsrechnungen' },
        { label: t('nav.approvals'),      path: '/erp/genehmigungen' },
      ],
    },
    {
      key: 'payments', label: t('nav.payments'), icon: <PaymentsIcon />, daily: true,
      children: [
        { label: t('nav.payments'),      path: '/erp/zahlungen' },
        { label: t('nav.bankStatement'),    path: '/erp/zahlungen/kontoauszug' },
        { label: t('nav.reconciliation'),   path: '/erp/zahlungen/abstimmung' },
        { label: t('nav.directDebit'),   path: '/erp/zahlungen/lastschrift' },
      ],
    },
    { key: 'products',   label: i18n.language === 'de' ? 'Produkte' : 'Products',    icon: <Inventory2Icon />,  path: '/erp/products',    daily: true },
    { key: 'priceLists', label: i18n.language === 'de' ? 'Preislisten' : 'Price Lists', icon: <LocalOfferIcon />, path: '/erp/price-lists' },
    { key: 'inventory',  label: t('nav.inventory'),  icon: <WarehouseIcon />,      path: '/erp/lager',      daily: true },
    { key: 'expenses',        label: t('nav.expenses'),        icon: <ReceiptLongIcon />,    path: '/erp/ausgaben',   daily: true },
    { key: 'chartOfAccounts', label: t('nav.chartOfAccounts'), icon: <AccountTreeIcon />,    path: '/erp/accounts',   daily: true },
    { key: 'suppliers',  label: t('nav.suppliers'),  icon: <LocalShippingIcon />,  path: '/erp/lieferanten' },
    { key: 'catalog',    label: t('nav.catalog'),    icon: <CategoryIcon />,       path: '/erp/katalog' },
    {
      key: 'tax', label: t('nav.tax'), icon: <AccountBalanceIcon />,
      children: [
        { label: t('nav.vatPreview'), path: '/erp/steuer/ustvavorschau' },
        { label: t('nav.elster'),     path: '/erp/steuer/elster' },
      ],
    },
    {
      key: 'reports', label: t('nav.reports'), icon: <BarChartIcon />,
      children: [
        { label: t('nav.trialBalance'), path: '/erp/berichte/susa' },
        { label: t('nav.pandl'),        path: '/erp/berichte/guv' },
        { label: t('nav.balanceSheet'), path: '/erp/berichte/bilanz' },
        { label: t('nav.bwa'),          path: '/erp/berichte/bwa' },
        { label: t('nav.datevExport'),  path: '/erp/berichte/datev-export' },
      ],
    },
    {
      key: 'mis', label: t('nav.mis'), icon: <BarChartIcon />,
      children: [
        { label: t('mis.overview'),  path: '/erp/mis',          exact: true },
        { label: t('mis.revenue'),   path: '/erp/mis/umsatz' },
        { label: t('mis.costs'),     path: '/erp/mis/kosten' },
        { label: t('mis.cashflow'),  path: '/erp/mis/cashflow' },
        { label: t('mis.payroll'),   path: '/erp/mis/lohn' },
        { label: t('mis.tax'),       path: '/erp/mis/steuer' },
      ],
    },
    {
      key: 'budget', label: t('nav.budget'), icon: <BarChartIcon />,
      children: [
        { label: t('nav.budgetPlan'),     path: '/erp/budget',            exact: true },
        { label: t('nav.budgetVariance'), path: '/erp/budget/abweichung' },
      ],
    },
    {
      key: 'employees', label: t('nav.employees'), icon: <BadgeIcon />,
      children: [
        { label: t('nav.masterData'),      path: '/erp/mitarbeiter' },
        { label: t('nav.absences'),        path: '/erp/mitarbeiter/abwesenheiten' },
        { label: t('nav.travelExpenses'),  path: '/erp/reisekosten' },
        { label: t('nav.payroll'),         path: '/erp/lohn' },
        { label: i18n.language === 'de' ? 'Event-Personal (M2)' : 'Event Staff (M2)', path: '/erp/lohn/event-staff' },
      ],
    },
    {
      key: 'fixedAssets', label: t('nav.fixedAssets'), icon: <PrecisionManufacturingIcon />,
      children: [
        { label: t('nav.assets'),          path: '/erp/anlagen' },
        { label: t('nav.depreciationRun'), path: '/erp/anlagen/abschreibungslauf' },
      ],
    },
    {
      key: 'settings', label: t('nav.settings'), icon: <SettingsIcon />,
      children: [
        { label: t('nav.company'),             path: '/erp/einstellungen/unternehmen' },
        { label: i18n.language === 'de' ? 'Features & Module' : 'Features & Modules', path: '/erp/einstellungen/features' },
        { label: t('nav.costCenters'),         path: '/erp/kostenstellen' },
        { label: t('nav.costCenterVariance'),  path: '/erp/kostenstellen/abweichung' },
        { label: t('nav.fiscalYears'),    path: '/erp/einstellungen/geschaeftsjahre' },
        { label: t('nav.bankAccounts'),      path: '/erp/einstellungen/bankkonten' },
        { label: t('nav.fxRates'),           path: '/erp/einstellungen/wechselkurse' },
        { label: t('nav.integrations'),      path: '/erp/einstellungen/integrationen' },
        { label: t('nav.openingBalances'),   path: '/erp/einstellungen/eroeffnungssalden' },
        { label: t('nav.serviceCatalog'),  path: '/erp/einstellungen/leistungen' },
        { label: t('nav.language'),       path: '/erp/einstellungen/sprache' },
        { label: t('nav.userManagement'), path: '/erp/einstellungen/benutzer' },
        { label: t('nav.profile'),        path: '/erp/einstellungen/profil' },
      ],
    },
  ];

  const visibleNAV = advanced ? NAV : NAV.filter((item) => item.daily);

  const { data: notifData } = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => notificationsApi.count(),
    refetchInterval: 60_000,
  });
  const unreadCount = notifData?.data?.unreadCount ?? 0;

  const { data: lowStockData } = useQuery({
    queryKey: ['inventory', 'low-stock', 'count'],
    queryFn: () => inventoryApi.lowStock(),
    refetchInterval: 120_000,
  });
  const lowStockCount = lowStockData?.data?.count ?? 0;

  const drawerWidth = collapsed ? DRAWER_MINI : DRAWER_FULL;

  const handleNav = (path: string) => navigate(path);
  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* noop */ }
    logout();
    navigate('/login');
  };

  const handleLanguageToggle = () => {
    const next = i18n.language.startsWith('en') ? 'de' : 'en';
    i18n.changeLanguage(next);
    setAnchorEl(null);
  };

  const dateStr = new Date().toLocaleDateString(
    i18n.language === 'de' ? 'de-DE' : 'en-GB',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            transition: 'width 0.2s',
            overflow: 'hidden',
            bgcolor: '#0f172a',
            color: '#cbd5e1',
            borderRight: 'none',
          },
        }}
      >
        {/* Logo area */}
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, minHeight: 56, justifyContent: collapsed ? 'center' : 'space-between' }}>
          {!collapsed && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} color="#f1f5f9" lineHeight={1.1}>{APP_ERP}</Typography>
              <Typography variant="caption" color="#64748b">
                {i18n.language === 'de' ? 'Buchhaltung & Controlling' : 'Accounting & Controlling'}
              </Typography>
            </Box>
          )}
          <IconButton size="small" onClick={() => setCollapsed(!collapsed)} sx={{ color: '#64748b', '&:hover': { color: '#f1f5f9' } }}>
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Box>
        <Divider sx={{ borderColor: '#1e293b' }} />

        <List dense sx={{
          flex: 1, py: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'thin',
          scrollbarColor: 'transparent transparent',
          '&:hover': { scrollbarColor: '#334155 transparent' },
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': { background: 'transparent', borderRadius: 4 },
          '&:hover::-webkit-scrollbar-thumb': { background: '#334155' },
        }}>
          {visibleNAV.map((item) => {
            if (item.path) {
              const active = isActive(item.path);
              return (
                <Tooltip key={item.key} title={collapsed ? item.label : ''} placement="right">
                  <ListItemButton
                    tabIndex={-1}
                    onClick={() => handleNav(item.path!)}
                    selected={active}
                    sx={{
                      borderRadius: 1, mx: 0.5, mb: 0.25,
                      color: active ? '#f1f5f9' : '#94a3b8',
                      bgcolor: active ? '#1e3a5f !important' : 'transparent',
                      '&:hover': { bgcolor: '#1e293b', color: '#f1f5f9' },
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      minHeight: 40,
                    }}
                  >
                    <ListItemIcon sx={{ color: 'inherit', minWidth: collapsed ? 0 : 36 }}>
                      {item.key === 'inventory' && lowStockCount > 0
                        ? <Badge badgeContent={lowStockCount} color="warning" max={99}>{item.icon}</Badge>
                        : item.icon}
                    </ListItemIcon>
                    {!collapsed && <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 13, fontWeight: active ? 600 : 400 }} />}
                  </ListItemButton>
                </Tooltip>
              );
            }

            // Section with children
            const isOpen = openSections[item.key];
            const anyChildActive = item.children?.some((c) =>
              c.exact ? location.pathname === c.path : isActive(c.path)
            ) ?? false;

            return (
              <Box key={item.key}>
                <Tooltip title={collapsed ? item.label : ''} placement="right">
                  <ListItemButton
                    tabIndex={-1}
                    onClick={() => !collapsed && toggleSection(item.key)}
                    sx={{
                      borderRadius: 1, mx: 0.5, mb: 0.25,
                      color: anyChildActive ? '#f1f5f9' : '#94a3b8',
                      '&:hover': { bgcolor: '#1e293b', color: '#f1f5f9' },
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      minHeight: 40,
                    }}
                  >
                    <ListItemIcon sx={{ color: 'inherit', minWidth: collapsed ? 0 : 36 }}>
                      {item.icon}
                    </ListItemIcon>
                    {!collapsed && (
                      <>
                        <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 13, fontWeight: anyChildActive ? 600 : 400 }} />
                        {isOpen ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
                      </>
                    )}
                  </ListItemButton>
                </Tooltip>
                {!collapsed && (
                  <Collapse in={isOpen} unmountOnExit>
                    <List dense disablePadding>
                      {item.children?.map((child) => {
                        const active = child.exact
                          ? location.pathname === child.path
                          : isActive(child.path);
                        return (
                          <ListItemButton
                            key={child.path}
                            tabIndex={-1}
                            onClick={() => handleNav(child.path)}
                            sx={{
                              pl: 5, pr: 1, py: 0.5, borderRadius: 1, mx: 0.5, mb: 0.25,
                              color: active ? '#60a5fa' : '#64748b',
                              bgcolor: active ? 'rgba(96,165,250,0.08) !important' : 'transparent',
                              '&:hover': { bgcolor: '#1e293b', color: '#94a3b8' },
                            }}
                          >
                            <ListItemText primary={child.label} primaryTypographyProps={{ fontSize: 12, fontWeight: active ? 600 : 400 }} />
                          </ListItemButton>
                        );
                      })}
                    </List>
                  </Collapse>
                )}
              </Box>
            );
          })}
        </List>

        {/* Advanced toggle */}
        <Divider sx={{ borderColor: '#1e293b' }} />
        <Box sx={{ px: collapsed ? 0 : 2, py: 1, display: 'flex', justifyContent: collapsed ? 'center' : 'space-between', alignItems: 'center' }}>
          {collapsed ? (
            <Tooltip title={advanced ? (i18n.language === 'de' ? 'Erweitert AN' : 'Advanced ON') : (i18n.language === 'de' ? 'Erweitert AUS' : 'Advanced OFF')} placement="right">
              <IconButton
                size="small"
                onClick={() => { const next = !advanced; setAdvanced(next); localStorage.setItem('erp-advanced', String(next)); }}
                sx={{ color: advanced ? '#60a5fa' : '#475569', '&:hover': { color: '#f1f5f9' } }}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <>
              <Box>
                <Typography variant="caption" fontWeight={600} color={advanced ? '#60a5fa' : '#64748b'} display="block" lineHeight={1.2}>
                  {i18n.language === 'de' ? 'Erweitert' : 'Advanced'}
                </Typography>
                <Typography variant="caption" color="#475569" sx={{ fontSize: 10 }}>
                  {advanced
                    ? (i18n.language === 'de' ? 'Verwaltung & Berichte' : 'Management & Reports')
                    : (i18n.language === 'de' ? 'Tagesgeschäft' : 'Daily operations')}
                </Typography>
              </Box>
              <Switch
                size="small"
                checked={advanced}
                onChange={(e) => { setAdvanced(e.target.checked); localStorage.setItem('erp-advanced', String(e.target.checked)); }}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: '#60a5fa' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#1e3a5f' },
                  '& .MuiSwitch-track': { bgcolor: '#334155' },
                }}
              />
            </>
          )}
        </Box>

        <Divider sx={{ borderColor: '#1e293b' }} />

        {/* User area */}
        <Box sx={{ p: 1 }}>
          {!collapsed && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: '#1e293b' } }}
              onClick={(e) => setAnchorEl(e.currentTarget)}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: '#1a56a8', fontSize: 13 }}>
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </Avatar>
              <Box flex={1} overflow="hidden">
                <Typography variant="body2" fontWeight={600} color="#f1f5f9" noWrap>{user?.firstName} {user?.lastName}</Typography>
                <Typography variant="caption" color="#64748b" noWrap>{user?.role}</Typography>
              </Box>
            </Box>
          )}
          {collapsed && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 0.5 }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: '#1a56a8', fontSize: 13, cursor: 'pointer' }}
                onClick={(e) => setAnchorEl(e.currentTarget)}>
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </Avatar>
            </Box>
          )}
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
            <MenuItem onClick={handleLanguageToggle}>
              <LanguageIcon fontSize="small" sx={{ mr: 1 }} />
              {i18n.language.startsWith('en') ? 'Deutsch' : 'English'}
            </MenuItem>
            <MenuItem onClick={() => { setAnchorEl(null); navigate('/erp/einstellungen/profil'); }}>
              <AccountCircleIcon fontSize="small" sx={{ mr: 1 }} /> {t('nav.profile')}
            </MenuItem>
            <MenuItem onClick={() => { setAnchorEl(null); navigate('/erp/einstellungen/sprache'); }}>
              <SettingsIcon fontSize="small" sx={{ mr: 1 }} /> {t('nav.language')}
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { setAnchorEl(null); handleLogout(); }}>
              <LogoutIcon fontSize="small" sx={{ mr: 1 }} /> {t('auth.signOut')}
            </MenuItem>
          </Menu>
        </Box>
      </Drawer>

      {/* Main content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <Box sx={{ height: 56, display: 'flex', alignItems: 'center', px: 3, bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', gap: 2 }}>
          <Box flex={1}>
            <Typography variant="body2" color="text.secondary">{dateStr}</Typography>
          </Box>
          <Tooltip title={t('nav.notifications')}>
            <IconButton size="small" onClick={() => navigate('/erp/benachrichtigungen')}>
              <Badge badgeContent={unreadCount > 0 ? unreadCount : null} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>
        </Box>

        {/* Read-only banner for tax advisor / viewer */}
        {(user?.role === 'erp_tax_advisor' || user?.role === 'erp_viewer') && (
          <Box sx={{ bgcolor: 'warning.main', color: 'warning.contrastText', px: 3, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, fontSize: 13 }}>
            <span>🔒</span>
            <span>
              {user.role === 'erp_tax_advisor'
                ? (i18n.language === 'de' ? 'Steuerberater-Lesezugriff — keine Änderungen möglich' : 'Tax advisor read-only access — no changes permitted')
                : (i18n.language === 'de' ? 'Lesezugriff — keine Änderungen möglich' : 'Read-only access — no changes permitted')}
            </span>
          </Box>
        )}

        {/* Page content */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3, bgcolor: '#f4f6fa' }}>
          <Outlet />
        </Box>
      </Box>

      {/* AI chat widget — visible on all MIS pages */}
      {location.pathname.startsWith('/erp/mis') && <MISChatWidget />}
    </Box>
  );
}
