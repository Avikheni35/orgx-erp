import { useQuery } from '@tanstack/react-query';
import {
  Box, Grid, Card, CardContent, Typography, Stack, Chip, Skeleton, Button,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { settingsApi } from '../../api/settings';
import { reportsApi } from '../../api/reports';
import { journalApi } from '../../api/journal';
import { salesInvoicesApi } from '../../api/salesInvoices';
import { vendorInvoicesApi } from '../../api/vendorInvoices';
import { useAuthStore } from '../../stores/authStore';
import { inventoryApi } from '../../api/inventory';

// ── formatters ────────────────────────────────────────────────────────────────
function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function fmtEur(eur: number, locale: string) {
  return eur.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// ── helpers ───────────────────────────────────────────────────────────────────
function getLast6Months(locale: string) {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString(locale, { month: 'short' }),
    };
  });
}

function groupByMonth(invoices: Array<{ invoiceDate: string; totalGrossCents: number }>) {
  const map: Record<string, number> = {};
  for (const inv of invoices) {
    const key = inv.invoiceDate.slice(0, 7);
    map[key] = (map[key] ?? 0) + inv.totalGrossCents;
  }
  return map;
}

// ── BarChart ──────────────────────────────────────────────────────────────────
function BarChart({
  months,
  revenueMap,
  expenseMap,
}: {
  months: { key: string; label: string }[];
  revenueMap: Record<string, number>;
  expenseMap: Record<string, number>;
}) {
  const W = 560, H = 175, PL = 56, PR = 8, PT = 10, PB = 26;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;
  const groupW = chartW / months.length;
  const barW   = Math.min(groupW * 0.3, 15);
  const maxVal = Math.max(
    ...months.map(m => revenueMap[m.key] ?? 0),
    ...months.map(m => expenseMap[m.key] ?? 0),
    1,
  );
  const toH = (v: number) => (v / maxVal) * chartH;
  const fmtAxis = (cents: number) => {
    const e = cents / 100;
    if (e >= 10000) return `${(e / 1000).toFixed(0)}k`;
    if (e >= 1000)  return `${(e / 1000).toFixed(1)}k`;
    return e.toFixed(0);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 175 }} preserveAspectRatio="xMidYMid meet">
      {[0.25, 0.5, 0.75, 1.0].map(frac => {
        const y = PT + chartH * (1 - frac);
        return (
          <g key={frac}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="currentColor" strokeOpacity={0.07} strokeWidth={1} />
            <text x={PL - 5} y={y + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.45}>
              {fmtAxis(maxVal * frac)}
            </text>
          </g>
        );
      })}
      <line x1={PL} y1={PT + chartH} x2={W - PR} y2={PT + chartH} stroke="currentColor" strokeOpacity={0.13} strokeWidth={1} />
      {months.map((m, i) => {
        const cx = PL + i * groupW + groupW / 2;
        const rv = revenueMap[m.key] ?? 0;
        const ex = expenseMap[m.key] ?? 0;
        return (
          <g key={m.key}>
            {rv > 0 && (
              <rect x={cx - barW - 1} y={PT + chartH - toH(rv)} width={barW} height={toH(rv)} fill="#1a56a8" rx={2} opacity={0.85} />
            )}
            {ex > 0 && (
              <rect x={cx + 1} y={PT + chartH - toH(ex)} width={barW} height={toH(ex)} fill="#ef4444" rx={2} opacity={0.75} />
            )}
            <text x={cx} y={H - 5} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.5}>
              {m.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({
  title, value, sub, icon, color, loading, onClick,
}: {
  title: string; value: string; sub?: string;
  icon: React.ReactNode; color: string; loading?: boolean; onClick?: () => void;
}) {
  return (
    <Card
      sx={{
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s, transform 0.15s',
        '&:hover': onClick ? { boxShadow: 6, transform: 'translateY(-1px)' } : {},
      }}
      onClick={onClick}
    >
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ bgcolor: color, borderRadius: 2, p: 1.5, color: 'white', display: 'flex', flexShrink: 0 }}>
          {icon}
        </Box>
        <Box flex={1} minWidth={0}>
          {loading ? (
            <>
              <Skeleton width="65%" height={26} />
              <Skeleton width="80%" height={14} sx={{ mt: 0.5 }} />
            </>
          ) : (
            <>
              <Typography
                variant="h6" fontWeight={700}
                sx={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.2, mb: 0.25 }}
              >
                {value}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">{title}</Typography>
              {sub && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ opacity: 0.7 }}>
                  {sub}
                </Typography>
              )}
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ErpDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const de     = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';

  const today         = new Date();
  const sixMonthsAgo  = new Date(today.getFullYear(), today.getMonth() - 6, 1).toISOString().slice(0, 10);
  const dateStr       = today.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // ── queries ──
  const { data: settingsData } = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: () => settingsApi.getCompany(),
  });
  const { data: arRaw,  isLoading: arLoading  } = useQuery({ queryKey: ['dash-ar'],   queryFn: () => reportsApi.ar() });
  const { data: apRaw,  isLoading: apLoading  } = useQuery({ queryKey: ['dash-ap'],   queryFn: () => reportsApi.ap() });
  const { data: cashRaw, isLoading: cashLoading } = useQuery({ queryKey: ['dash-cash'], queryFn: () => journalApi.ledger('1000') });
  const { data: bankRaw, isLoading: bankLoading } = useQuery({ queryKey: ['dash-bank'], queryFn: () => journalApi.ledger('1200') });
  const { data: salesRaw } = useQuery({
    queryKey: ['dash-sales', sixMonthsAgo],
    queryFn:  () => salesInvoicesApi.list({ from: sixMonthsAgo, limit: 500 }),
  });
  const { data: vendorRaw } = useQuery({
    queryKey: ['dash-vendor', sixMonthsAgo],
    queryFn:  () => vendorInvoicesApi.list({ from: sixMonthsAgo, limit: 500 }),
  });
  const { data: journalRaw, isLoading: journalLoading } = useQuery({
    queryKey: ['dash-journal'],
    queryFn:  () => journalApi.list({ status: 'posted', limit: 8 }),
  });
  const { data: lowStockRaw, isLoading: lowStockLoading } = useQuery({
    queryKey: ['dash-low-stock'],
    queryFn:  () => inventoryApi.lowStock(),
    refetchInterval: 120_000,
  });

  // ── derived ──
  const configured = settingsData?.data?.configured;
  const settings   = settingsData?.data?.settings;

  const ar = arRaw?.data;
  const ap = apRaw?.data;

  const cashBalance = cashRaw?.data?.finalBalance ?? 0;
  const bankBalance = bankRaw?.data?.finalBalance ?? 0;

  const overdueItems = ar?.items.filter(i => i.daysOverdue > 0) ?? [];
  const overdueCents = overdueItems.reduce((s, i) => s + i.openCents, 0);

  const sevenDaysMs   = 7 * 24 * 60 * 60 * 1000;
  const upcomingItems = (ar?.items ?? [])
    .filter(i => {
      const diff = new Date(i.dueDate).getTime() - today.getTime();
      return diff >= 0 && diff <= sevenDaysMs;
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 7);

  const months     = getLast6Months(locale);
  const revenueMap = groupByMonth(salesRaw?.data?.invoices  ?? []);
  const expenseMap = groupByMonth(vendorRaw?.data?.invoices ?? []);

  const thisKey     = months[5].key;
  const lastKey     = months[4].key;
  const thisRevenue = revenueMap[thisKey] ?? 0;
  const lastRevenue = revenueMap[lastKey] ?? 0;
  const revDelta    = lastRevenue > 0 ? Math.round((thisRevenue - lastRevenue) / lastRevenue * 100) : null;

  const recentEntries = journalRaw?.data?.entries ?? [];

  const lowStockCount   = lowStockRaw?.data?.count ?? 0;
  const lowStockVariants = lowStockRaw?.data?.variants.length ?? 0;

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('dashboard.title')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('dashboard.welcome', { name: user?.firstName, date: dateStr })}
          </Typography>
        </Box>
      </Stack>

      {/* Setup banners */}
      {configured === false && (
        <Card sx={{ mb: 3, border: '1px solid #f59e0b', bgcolor: '#fffbeb' }}>
          <CardContent>
            <Stack direction="row" alignItems="center" gap={2}>
              <WarningAmberIcon sx={{ color: '#d97706', fontSize: 32 }} />
              <Box flex={1}>
                <Typography fontWeight={600} color="#92400e">{t('dashboard.setupBanner')}</Typography>
              </Box>
              <Button variant="contained" color="warning" startIcon={<SettingsIcon />}
                onClick={() => navigate('/erp/einstellungen/unternehmen')}>
                {t('dashboard.setupButton')}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}
      {configured && (
        <Card sx={{ mb: 3, border: '1px solid #16a34a', bgcolor: '#f0fdf4' }}>
          <CardContent sx={{ py: '12px !important' }}>
            <Stack direction="row" alignItems="center" gap={1.5}>
              <CheckCircleIcon sx={{ color: '#16a34a' }} />
              <Typography variant="body2" fontWeight={600} color="#15803d">
                {t('dashboard.configuredBanner', {
                  company: settings?.companyName || t('nav.company'),
                  chart:   settings?.chartOfAccounts,
                  vatId:   settings?.vatId || '—',
                })}
              </Typography>
              <Chip label={settings?.legalForm} size="small" sx={{ ml: 'auto' }} />
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* ── Stat cards ── */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              cursor: 'pointer', height: '100%',
              border: '2px dashed', borderColor: 'primary.main',
              transition: 'box-shadow 0.15s, transform 0.15s',
              '&:hover': { boxShadow: 6, transform: 'translateY(-1px)' },
            }}
            onClick={() => navigate('/erp/verkauf/rechnungen/new')}
          >
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ bgcolor: '#1a56a8', borderRadius: 2, p: 1.5, color: 'white', display: 'flex', flexShrink: 0 }}>
                <AddCircleOutlineIcon />
              </Box>
              <Box>
                <Typography variant="h6" fontWeight={700} color="primary.main">
                  {de ? 'Neue Rechnung' : 'New Invoice'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {de ? 'Ausgangsrechnung erstellen' : 'Create sales invoice'}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title={de ? 'Offene Verbindlichkeiten' : 'Open Payables'}
            value={ap ? fmtCents(ap.totalOpen, locale) : '—'}
            sub={ap ? `${ap.items.length} ${de ? 'Eingangsrechnungen' : 'invoices'}` : undefined}
            icon={<AccountBalanceWalletIcon />}
            color="#d97706"
            loading={apLoading}
            onClick={() => navigate('/erp/berichte/offene-posten-kreditoren')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title={de ? 'Überfällig' : 'Overdue'}
            value={
              arLoading ? '—'
              : overdueItems.length > 0 ? fmtCents(overdueCents, locale)
              : (de ? '✓ Keine' : '✓ None')
            }
            sub={overdueItems.length > 0 ? `${overdueItems.length} ${de ? 'Rechnungen' : 'invoices'}` : undefined}
            icon={<WarningAmberIcon />}
            color={overdueItems.length > 0 ? '#dc2626' : '#16a34a'}
            loading={arLoading}
            onClick={() => navigate('/erp/berichte/offene-posten-debitoren')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title={de ? 'Kasse + Bank' : 'Cash + Bank'}
            value={cashLoading || bankLoading ? '—' : fmtEur(cashBalance + bankBalance, locale)}
            sub={
              cashLoading || bankLoading
                ? undefined
                : `${de ? 'Kasse' : 'Cash'} ${fmtEur(cashBalance, locale)} · ${de ? 'Bank' : 'Bank'} ${fmtEur(bankBalance, locale)}`
            }
            icon={<AccountBalanceIcon />}
            color="#16a34a"
            loading={cashLoading || bankLoading}
            onClick={() => navigate('/erp/kasse')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title={de ? 'Unter Mindestbestand' : 'Below Threshold'}
            value={lowStockLoading ? '—' : lowStockCount > 0 ? String(lowStockCount) : (de ? '✓ Alle OK' : '✓ All OK')}
            sub={
              !lowStockLoading && lowStockCount > 0
                ? `${lowStockRaw?.data?.products.length ?? 0} ${de ? 'Produkte' : 'products'} · ${lowStockVariants} ${de ? 'Varianten' : 'variants'}`
                : undefined
            }
            icon={<WarehouseIcon />}
            color={lowStockCount > 0 ? '#d97706' : '#16a34a'}
            loading={lowStockLoading}
            onClick={() => navigate('/erp/lager')}
          />
        </Grid>
      </Grid>

      {/* ── Chart + Upcoming ── */}
      <Grid container spacing={3} mb={3}>
        {/* Revenue / Expense chart */}
        <Grid item xs={12} md={7}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={1.5} flexWrap="wrap" gap={1}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {de ? 'Umsatz & Aufwand' : 'Revenue & Expenses'}
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      {de ? 'letzte 6 Monate' : 'last 6 months'}
                    </Typography>
                  </Typography>
                  {thisRevenue > 0 && (
                    <Stack direction="row" alignItems="center" gap={1} mt={0.25}>
                      <Typography variant="body2" color="text.secondary">
                        {de ? 'Dieser Monat:' : 'This month:'}{' '}
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(thisRevenue, locale)}</strong>
                      </Typography>
                      {revDelta !== null && (
                        <Chip
                          size="small"
                          label={`${revDelta >= 0 ? '+' : ''}${revDelta}%`}
                          color={revDelta >= 0 ? 'success' : 'error'}
                          sx={{ height: 18, fontSize: 10 }}
                        />
                      )}
                    </Stack>
                  )}
                </Box>
                <Stack direction="row" gap={2} alignItems="center" flexShrink={0}>
                  <Stack direction="row" gap={0.5} alignItems="center">
                    <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: '#1a56a8' }} />
                    <Typography variant="caption" color="text.secondary">{de ? 'Umsatz' : 'Revenue'}</Typography>
                  </Stack>
                  <Stack direction="row" gap={0.5} alignItems="center">
                    <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: '#ef4444' }} />
                    <Typography variant="caption" color="text.secondary">{de ? 'Aufwand' : 'Expenses'}</Typography>
                  </Stack>
                </Stack>
              </Stack>
              <BarChart months={months} revenueMap={revenueMap} expenseMap={expenseMap} />
            </CardContent>
          </Card>
        </Grid>

        {/* Upcoming dues */}
        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {de ? 'Fällig in 7 Tagen' : 'Due in 7 Days'}
                </Typography>
                {upcomingItems.length > 0 && (
                  <Chip label={upcomingItems.length} size="small" color="warning" />
                )}
              </Stack>
              {arLoading ? (
                <Stack gap={1.5}>{[1, 2, 3].map(n => <Skeleton key={n} height={50} sx={{ borderRadius: 1 }} />)}</Stack>
              ) : upcomingItems.length === 0 ? (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <CheckCircleIcon sx={{ color: '#16a34a', fontSize: 36, mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    {de ? 'Keine Rechnungen fällig' : 'No invoices due soon'}
                  </Typography>
                </Box>
              ) : (
                <Stack gap={1}>
                  {upcomingItems.map(item => {
                    const daysLeft = Math.ceil(
                      (new Date(item.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
                    );
                    return (
                      <Box
                        key={item._id}
                        onClick={() => navigate(`/erp/verkauf/rechnungen/${item._id}`)}
                        sx={{
                          p: 1.25, borderRadius: 1, cursor: 'pointer',
                          border: '1px solid', borderColor: 'divider',
                          display: 'flex', alignItems: 'center', gap: 1.5,
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                      >
                        <Box flex={1} minWidth={0}>
                          <Typography variant="body2" fontWeight={600} noWrap>{item.companyName}</Typography>
                          <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                            {item.invoiceNumber}
                          </Typography>
                        </Box>
                        <Box textAlign="right" flexShrink={0}>
                          <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {fmtCents(item.openCents, locale)}
                          </Typography>
                          <Chip
                            size="small"
                            label={daysLeft === 0 ? (de ? 'Heute' : 'Today') : `${daysLeft}d`}
                            color={daysLeft === 0 ? 'error' : daysLeft <= 2 ? 'warning' : 'default'}
                            sx={{ height: 16, fontSize: 10 }}
                          />
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Recent journal postings ── */}
      <Card>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="subtitle1" fontWeight={600}>
              {de ? 'Zuletzt gebucht' : 'Recent Postings'}
            </Typography>
            <Button size="small" tabIndex={-1} onClick={() => navigate('/erp/buchfuehrung')}>
              {de ? 'Alle anzeigen' : 'View all'}
            </Button>
          </Stack>
          {journalLoading ? (
            <Stack gap={1}>{[1, 2, 3, 4].map(n => <Skeleton key={n} height={36} />)}</Stack>
          ) : recentEntries.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
              {de ? 'Noch keine Buchungssätze vorhanden.' : 'No journal entries yet.'}
            </Typography>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      de ? 'Datum'        : 'Date',
                      de ? 'Belegnr.'     : 'Ref.',
                      de ? 'Beschreibung' : 'Description',
                      de ? 'Betrag'       : 'Amount',
                      'Status',
                    ].map(h => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left', padding: '4px 10px', fontSize: 11,
                          opacity: 0.5, fontWeight: 600, whiteSpace: 'nowrap',
                          borderBottom: '1px solid rgba(128,128,128,0.15)',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentEntries.map((e, idx) => {
                    const statusLabel = e.status === 'posted'
                      ? (de ? 'Gebucht' : 'Posted')
                      : e.status === 'reversed'
                      ? (de ? 'Storniert' : 'Reversed')
                      : (de ? 'Entwurf' : 'Draft');
                    const statusColor = e.status === 'posted'
                      ? { bg: '#dcfce7', fg: '#15803d' }
                      : e.status === 'reversed'
                      ? { bg: '#fee2e2', fg: '#b91c1c' }
                      : { bg: '#fef9c3', fg: '#854d0e' };
                    return (
                      <tr
                        key={e._id}
                        onClick={() => navigate(`/erp/buchfuehrung/${e._id}`)}
                        style={{
                          cursor: 'pointer',
                          background: idx % 2 === 1 ? 'rgba(128,128,128,0.03)' : undefined,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={ev => { ev.currentTarget.style.background = 'rgba(128,128,128,0.07)'; }}
                        onMouseLeave={ev => { ev.currentTarget.style.background = idx % 2 === 1 ? 'rgba(128,128,128,0.03)' : ''; }}
                      >
                        <td style={{ padding: '7px 10px', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {new Date(e.date).toLocaleDateString(locale)}
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap', opacity: 0.65 }}>
                          {e.entryNumber}
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: 13, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.description}
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: 13, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtEur(e.totalDebit, locale)}
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                            background: statusColor.bg, color: statusColor.fg,
                          }}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
