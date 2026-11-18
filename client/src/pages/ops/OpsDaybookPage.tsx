import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Stack, IconButton, Paper, Divider,
  CircularProgress, Chip, Collapse, Table, TableHead,
  TableRow, TableCell, TableBody,
} from '@mui/material';
import ChevronLeftIcon  from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon        from '@mui/icons-material/Today';
import ExpandMoreIcon   from '@mui/icons-material/ExpandMore';
import ExpandLessIcon   from '@mui/icons-material/ExpandLess';
import ReceiptLongIcon  from '@mui/icons-material/ReceiptLong';
import { salesInvoicesApi, type SalesInvoice } from '../../api/salesInvoices';
import { useTranslation } from 'react-i18next';

const MONO         = '"JetBrains Mono", "Courier New", monospace';
const ACCENT       = '#e8801a';
const ACCENT_MUTED = 'rgba(232, 128, 26, 0.1)';

function fmtCents(cents: number, locale = 'de-DE') {
  return (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
}
function fmtTime(iso: string, locale = 'de-DE') {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

interface TileProps { label: string; value: string; sub?: string; accent?: boolean }

function SummaryTile({ label, value, sub, accent }: TileProps) {
  return (
    <Paper
      elevation={3}
      sx={{
        flex: 1, px: 2, py: 2, borderRadius: 2,
        borderTop: `3px solid ${accent ? ACCENT : 'transparent'}`,
        position: 'relative', overflow: 'hidden',
      }}
    >
      <Typography sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, fontWeight: 600, color: 'text.secondary', mb: 0.75 }}>
        {label}
      </Typography>
      <Typography sx={{
        fontFamily: MONO, fontWeight: 800, fontSize: 22, fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1, color: accent ? ACCENT : 'text.primary',
      }}>
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontFamily: MONO, fontSize: 11, color: 'text.disabled', fontVariantNumeric: 'tabular-nums', mt: 0.5 }}>
          {sub}
        </Typography>
      )}
    </Paper>
  );
}

function SaleRow({ inv, locale, de }: { inv: SalesInvoice; locale: string; de: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        gap={1.5}
        sx={{
          px: 2, py: 1.75, cursor: 'pointer',
          borderLeft: `3px solid ${inv.status === 'paid' ? '#4caf50' : '#ff9800'}`,
          transition: 'background 0.1s',
          '&:hover': { bgcolor: 'action.hover' },
        }}
        onClick={() => setOpen(o => !o)}
      >
        <Typography sx={{ fontFamily: MONO, fontSize: 10, color: 'text.disabled', minWidth: 38, fontVariantNumeric: 'tabular-nums' }}>
          {fmtTime(inv.createdAt, locale)}
        </Typography>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{inv.invoiceNumber}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {inv.lineItems.map(l => l.description).join(', ')}
          </Typography>
        </Box>

        <Chip
          size="small"
          label={inv.status === 'paid' ? (de ? 'Bezahlt' : 'Paid') : inv.status}
          color={inv.status === 'paid' ? 'success' : 'default'}
          sx={{ fontSize: 10, height: 18 }}
        />

        <Typography sx={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>
          {fmtCents(inv.totalGrossCents, locale)}
        </Typography>

        <IconButton size="small" sx={{ color: 'text.disabled', p: 0.25 }}>
          {open ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Stack>

      <Collapse in={open}>
        <Box sx={{ pl: 7, pr: 2.5, pb: 1.5, bgcolor: 'action.hover' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: 10, color: 'text.secondary', py: 0.75, pl: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
                  {de ? 'Artikel' : 'Item'}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 10, color: 'text.secondary', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>{de ? 'Menge' : 'Qty'}</TableCell>
                <TableCell align="right" sx={{ fontSize: 10, color: 'text.secondary', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>{de ? 'Preis' : 'Price'}</TableCell>
                <TableCell align="right" sx={{ fontSize: 10, color: 'text.secondary', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>MwSt</TableCell>
                <TableCell align="right" sx={{ fontSize: 10, color: 'text.secondary', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>{de ? 'Gesamt' : 'Total'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {inv.lineItems.map((l, i) => (
                <TableRow key={i}>
                  <TableCell sx={{ fontSize: 12, py: 0.75, pl: 0, borderBottom: 'none' }}>{l.description}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: MONO, fontSize: 12, py: 0.75, borderBottom: 'none' }}>{l.quantity}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: MONO, fontSize: 12, py: 0.75, borderBottom: 'none', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtCents(l.unitPriceCents, locale)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: MONO, fontSize: 12, py: 0.75, borderBottom: 'none', color: 'text.secondary' }}>
                    {l.vatRate}%
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, py: 0.75, borderBottom: 'none', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtCents(l.totalGrossCents, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Stack sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }} gap={0.5}>
            <Stack direction="row" justifyContent="space-between">
              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{de ? 'Netto' : 'Net'}</Typography>
              <Typography sx={{ fontFamily: MONO, fontSize: 11, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                {fmtCents(inv.totalNetCents, locale)}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>MwSt</Typography>
              <Typography sx={{ fontFamily: MONO, fontSize: 11, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                {fmtCents(inv.totalVatCents, locale)}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{de ? 'Brutto' : 'Gross'}</Typography>
              <Typography sx={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: ACCENT }}>
                {fmtCents(inv.totalGrossCents, locale)}
              </Typography>
            </Stack>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}

export default function OpsDaybookPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [date, setDate] = useState(() => new Date());
  const today   = isoDate(new Date());
  const isToday = isoDate(date) === today;

  const from = new Date(date); from.setHours(0, 0, 0, 0);
  const to   = new Date(date); to.setHours(23, 59, 59, 999);

  const { data, isLoading } = useQuery({
    queryKey: ['ops-daybook', isoDate(date)],
    queryFn:  () => salesInvoicesApi.list({ from: from.toISOString(), to: to.toISOString(), limit: 200 }),
    staleTime: isToday ? 0 : 5 * 60_000,
  });

  const allInvoices = data?.data.invoices ?? [];

  // Separate by type so totals are never polluted by drafts or returns
  const paidSales   = allInvoices.filter(i => i.status === 'paid' && i.totalGrossCents > 0);
  const returns     = allInvoices.filter(i => i.status === 'paid' && i.totalGrossCents < 0);
  const drafts      = allInvoices.filter(i => i.status === 'draft');
  const invoices    = [...paidSales, ...returns]; // display list (exclude drafts from main list)

  const totals = useMemo(() => {
    const gross = paidSales.reduce((s, i) => s + i.totalGrossCents, 0);
    const net   = paidSales.reduce((s, i) => s + i.totalNetCents,   0);
    const vat   = paidSales.reduce((s, i) => s + i.totalVatCents,   0);
    const returnGross = returns.reduce((s, i) => s + i.totalGrossCents, 0); // negative
    const netRevenue  = gross + returnGross; // gross sales minus returns

    const vatMap = new Map<number, { net: number; vat: number; gross: number }>();
    paidSales.forEach(inv => {
      inv.lineItems.forEach(l => {
        const cur = vatMap.get(l.vatRate) ?? { net: 0, vat: 0, gross: 0 };
        vatMap.set(l.vatRate, {
          net:   cur.net   + l.totalNetCents,
          vat:   cur.vat   + l.totalVatCents,
          gross: cur.gross + l.totalGrossCents,
        });
      });
    });
    const vatRows = [...vatMap.entries()].sort((a, b) => b[0] - a[0]);
    return { gross, net, vat, vatRows, returnGross, netRevenue };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allInvoices]);

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: { xs: 1.5, sm: 2.5 } }}>
    <Box sx={{ maxWidth: 680, mx: 'auto' }}>

      {/* date navigation */}
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="center" gap={1}>
          <IconButton
            onClick={() => setDate(d => addDays(d, -1))}
            sx={{ bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' } }}
          >
            <ChevronLeftIcon />
          </IconButton>

          <Box sx={{ minWidth: 240, textAlign: 'center' }}>
            <Typography sx={{
              fontFamily: MONO, fontWeight: 800, fontSize: 22,
              fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, color: 'text.primary',
            }}>
              {date.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}
            </Typography>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', letterSpacing: 2, textTransform: 'uppercase', mt: 0.5 }}>
              {date.toLocaleDateString(locale, { weekday: 'long', year: 'numeric' })}
            </Typography>
            {isToday && (
              <Box sx={{ mt: 0.75 }}>
                <Chip
                  icon={<TodayIcon sx={{ fontSize: '11px !important' }} />}
                  label={de ? 'Heute' : 'Today'}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: 10, fontWeight: 700, color: ACCENT, borderColor: ACCENT, bgcolor: ACCENT_MUTED }}
                />
              </Box>
            )}
          </Box>

          <IconButton
            onClick={() => setDate(d => addDays(d, 1))}
            disabled={isToday}
            sx={{ bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' } }}
          >
            <ChevronRightIcon />
          </IconButton>
        </Stack>
      </Box>

      {isLoading ? (
        <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress /></Box>
      ) : allInvoices.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <ReceiptLongIcon sx={{ fontSize: 52, opacity: 0.12, mb: 1.5, display: 'block', mx: 'auto' }} />
          <Typography variant="body2" sx={{ color: 'text.disabled' }}>
            {de ? 'Keine Buchungen an diesem Tag.' : 'No transactions on this day.'}
          </Typography>
        </Box>
      ) : (
        <>
          {/* summary tiles */}
          <Stack direction="row" gap={1.5} mb={2.5} flexWrap="wrap">
            <SummaryTile
              accent
              label={de ? 'Umsatz brutto' : 'Gross sales'}
              value={fmtCents(totals.gross, locale)}
              sub={`${paidSales.length} ${de ? 'Verkäufe' : 'sales'}`}
            />
            {returns.length > 0 && (
              <SummaryTile
                label={de ? 'Rückgaben' : 'Returns'}
                value={fmtCents(totals.returnGross, locale)}
                sub={`${returns.length} ${de ? 'Rückgaben' : 'returns'}`}
              />
            )}
            <SummaryTile
              label={de ? 'Nettoumsatz' : 'Net revenue'}
              value={fmtCents(totals.netRevenue, locale)}
              sub={`MwSt ${fmtCents(totals.vat, locale)} · Netto ${fmtCents(totals.net, locale)}`}
            />
          </Stack>

          {/* VAT breakdown */}
          {totals.vatRows.length > 0 && (
            <Paper elevation={2} sx={{ mb: 2.5, borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ px: 2, py: 1.25 }}>
                <Typography sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, fontWeight: 600, color: 'text.secondary' }}>
                  {de ? 'MwSt-Aufschlüsselung' : 'VAT breakdown'}
                </Typography>
              </Box>
              <Divider />
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell sx={{ fontSize: 10, color: 'text.secondary', py: 1, fontWeight: 600 }}>{de ? 'Satz' : 'Rate'}</TableCell>
                    <TableCell align="right" sx={{ fontSize: 10, color: 'text.secondary', py: 1, fontWeight: 600 }}>{de ? 'Netto' : 'Net'}</TableCell>
                    <TableCell align="right" sx={{ fontSize: 10, color: 'text.secondary', py: 1, fontWeight: 600 }}>MwSt</TableCell>
                    <TableCell align="right" sx={{ fontSize: 10, color: 'text.secondary', py: 1, fontWeight: 600 }}>{de ? 'Brutto' : 'Gross'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {totals.vatRows.map(([rate, row]) => (
                    <TableRow key={rate}>
                      <TableCell sx={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, py: 1, color: ACCENT }}>{rate}%</TableCell>
                      <TableCell align="right" sx={{ fontFamily: MONO, fontSize: 12, py: 1, fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                        {fmtCents(row.net, locale)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: MONO, fontSize: 12, py: 1, fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                        {fmtCents(row.vat, locale)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, py: 1, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtCents(row.gross, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          {/* transaction list — paid sales + returns */}
          {invoices.length > 0 && (
            <Paper elevation={2} sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover' }}>
                <Typography sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, fontWeight: 600, color: 'text.secondary' }}>
                  {de ? 'Einzelbuchungen' : 'Transactions'}
                </Typography>
              </Box>
              <Divider />
              {invoices.map((inv, idx) => (
                <Box key={inv._id}>
                  {idx > 0 && <Divider />}
                  <SaleRow inv={inv} locale={locale} de={de} />
                </Box>
              ))}
            </Paper>
          )}

          {/* drafts — not counted in totals */}
          {drafts.length > 0 && (
            <Paper elevation={2} sx={{ mt: 2, borderRadius: 2, overflow: 'hidden', border: '1px dashed', borderColor: 'warning.light' }}>
              <Box sx={{ px: 2, py: 1.25, bgcolor: 'warning.50' }}>
                <Stack direction="row" alignItems="center" gap={1}>
                  <Typography sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, fontWeight: 600, color: 'warning.dark' }}>
                    {de ? 'Offene Entwürfe (nicht im Umsatz)' : 'Open drafts (excluded from totals)'}
                  </Typography>
                  <Chip label={drafts.length} size="small" color="warning" sx={{ height: 16, fontSize: 10, fontWeight: 700 }} />
                </Stack>
              </Box>
              <Divider sx={{ borderColor: 'warning.light' }} />
              {drafts.map((inv, idx) => (
                <Box key={inv._id}>
                  {idx > 0 && <Divider />}
                  <SaleRow inv={inv} locale={locale} de={de} />
                </Box>
              ))}
            </Paper>
          )}
        </>
      )}
    </Box>
    </Box>
  );
}
