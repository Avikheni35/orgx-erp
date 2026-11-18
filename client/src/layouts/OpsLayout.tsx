import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, IconButton, Avatar, Paper, ButtonBase,
} from '@mui/material';
import LogoutIcon           from '@mui/icons-material/Logout';
import PointOfSaleIcon      from '@mui/icons-material/PointOfSale';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import Inventory2Icon        from '@mui/icons-material/Inventory2';
import MenuBookIcon          from '@mui/icons-material/MenuBook';
import ArrowBackIcon         from '@mui/icons-material/ArrowBack';
import TrendingUpIcon        from '@mui/icons-material/TrendingUp';
import { useAuthStore }      from '../stores/authStore';
import { authApi }           from '../api/auth';
import { useTranslation }    from 'react-i18next';
import { useQuery }          from '@tanstack/react-query';
import { salesInvoicesApi }  from '../api/salesInvoices';
import type { SvgIconComponent } from '@mui/icons-material';

const TABS: { path: string; de: string; en: string; Icon: SvgIconComponent }[] = [
  { path: '/ops/sales',   de: 'Verkauf',   en: 'Sales',   Icon: PointOfSaleIcon },
  { path: '/ops/cash',    de: 'Kasse',     en: 'Cash',    Icon: AccountBalanceWalletIcon },
  { path: '/ops/stock',   de: 'Lager',     en: 'Stock',   Icon: Inventory2Icon },
  { path: '/ops/daybook', de: 'Tagesbuch', en: 'Daybook', Icon: MenuBookIcon },
];

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function fmtCents(cents: number, locale = 'de-DE') {
  return (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
}

const MONO         = '"JetBrains Mono", "Courier New", monospace';
const ACCENT       = '#e8801a';
const ACCENT_HOVER = '#c96a12';
const NAV_BG       = '#070e1c';

export default function OpsLayout() {
  const navigate         = useNavigate();
  const location         = useLocation();
  const { user, logout } = useAuthStore();
  const { i18n }         = useTranslation();
  const de               = i18n.language === 'de';
  const now              = useClock();

  const tabIndex  = TABS.findIndex(t => location.pathname.startsWith(t.path));
  const activeTab = tabIndex >= 0 ? tabIndex : 0;

  const isAdmin = user?.role && ['erp_admin', 'erp_accountant', 'agency_admin', 'disponent'].includes(user.role);
  const locale  = de ? 'de-DE' : 'en-GB';

  const todayFrom = new Date(); todayFrom.setHours(0, 0, 0, 0);
  const todayTo   = new Date(); todayTo.setHours(23, 59, 59, 999);
  const { data: todayData } = useQuery({
    queryKey: ['ops-layout-today'],
    queryFn:  () => salesInvoicesApi.list({ from: todayFrom.toISOString(), to: todayTo.toISOString(), limit: 100 }),
    refetchInterval: 60_000,
  });
  // Net revenue: paid sales minus returns (returns have negative totalGrossCents)
  const todayRevenue = (todayData?.data.invoices ?? [])
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + i.totalGrossCents, 0);

  async function handleLogout() {
    try { await authApi.logout(); } catch { /* ignore */ }
    logout();
    navigate('/login');
  }

  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
  const timeStr  = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr  = now.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>

      {/* ── header ──────────────────────────────────────────────────────────────── */}
      <AppBar
        position="static"
        elevation={0}
        sx={{
          background: `linear-gradient(135deg, ${NAV_BG} 0%, #0c1a30 100%)`,
          flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Toolbar variant="dense" sx={{ minHeight: 50, gap: 1.5, px: { xs: 1.5, sm: 2 } }}>

          {isAdmin && (
            <IconButton
              size="small"
              onClick={() => navigate('/erp/dashboard')}
              title={de ? 'Zurück zum ERP' : 'Back to ERP'}
              sx={{ color: 'rgba(255,255,255,0.32)', borderRadius: 1, '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' } }}
            >
              <ArrowBackIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}

          {/* amber brand bar */}
          <Box sx={{ width: 3, height: 22, bgcolor: ACCENT, borderRadius: 0.5, flexShrink: 0, boxShadow: `0 0 8px ${ACCENT}90` }} />

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.88)', lineHeight: 1, letterSpacing: -0.2 }} noWrap>
              {dateStr}
            </Typography>
            <Typography sx={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', letterSpacing: 2.2, textTransform: 'uppercase', lineHeight: 2.1, display: { xs: 'none', sm: 'block' } }}>
              {de ? 'Betriebsmodus' : 'Operations'}
            </Typography>
          </Box>

          {todayRevenue > 0 && (
            <Box sx={{
              display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5,
              bgcolor: 'rgba(76,175,80,0.12)', border: '1px solid rgba(76,175,80,0.22)',
              borderRadius: 1.5, px: 1.25, py: 0.4,
            }}>
              <TrendingUpIcon sx={{ fontSize: 12, color: '#5cb85c' }} />
              <Typography sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: '#5cb85c', fontVariantNumeric: 'tabular-nums' }}>
                {fmtCents(todayRevenue, locale)}
              </Typography>
            </Box>
          )}

          <Typography sx={{
            fontFamily: MONO, fontSize: 21, fontWeight: 700, letterSpacing: -0.8,
            fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.92)', flexShrink: 0,
          }}>
            {timeStr}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1.5, borderLeft: '1px solid rgba(255,255,255,0.07)' }}>
            <Avatar sx={{ width: 26, height: 26, fontSize: 10, fontWeight: 700, bgcolor: ACCENT }}>
              {initials}
            </Avatar>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: { xs: 'none', sm: 'block' }, fontSize: 10 }} noWrap>
              {user?.firstName}
            </Typography>
            <IconButton size="small" onClick={handleLogout} sx={{ color: 'rgba(255,255,255,0.28)', borderRadius: 1, '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' } }}>
              <LogoutIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* ── page outlet (pages manage their own scroll) ──────────────────────────── */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </Box>

      {/* ── bottom tab bar ──────────────────────────────────────────────────────── */}
      <Box sx={{ flexShrink: 0, px: 1.5, pb: 1.5, pt: 0.5 }}>
        <Paper
          elevation={10}
          sx={{ borderRadius: 3, overflow: 'hidden', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}
        >
          <Box sx={{ display: 'flex', height: 62, px: 0.5, py: 0.5, gap: 0.5 }}>
            {TABS.map((t, i) => {
              const active = i === activeTab;
              return (
                <ButtonBase
                  key={i}
                  onClick={() => navigate(t.path)}
                  sx={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 0.4,
                    borderRadius: 2.5,
                    color: active ? '#fff' : 'text.secondary',
                    bgcolor: active ? ACCENT : 'transparent',
                    transition: 'all 0.16s cubic-bezier(.4,0,.2,1)',
                    boxShadow: active ? `0 3px 12px ${ACCENT}48` : 'none',
                    '&:hover': { bgcolor: active ? ACCENT_HOVER : 'action.hover' },
                  }}
                >
                  <t.Icon sx={{ fontSize: 19 }} />
                  <Typography sx={{ fontSize: 9, fontWeight: active ? 700 : 500, letterSpacing: 0.7, textTransform: 'uppercase', lineHeight: 1 }}>
                    {de ? t.de : t.en}
                  </Typography>
                </ButtonBase>
              );
            })}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
