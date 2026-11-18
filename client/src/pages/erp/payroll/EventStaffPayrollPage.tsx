import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Table, TableHead, TableBody, TableRow, TableCell,
  CircularProgress, Alert, Chip, FormControl, InputLabel, Select, MenuItem,
  Card, CardContent, Divider, Button, Tooltip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, InputAdornment,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { useTranslation } from 'react-i18next';
import { integrationsApi, type M2TimesheetRow, type M2StaffRow, type M2PaymentRow } from '../../../api/integrations';
import { accountsApi, type Account } from '../../../api/accounts';

const now = new Date();

type SyncStatus = string;

function syncChipProps(s: SyncStatus): { label: string; color: 'default' | 'info' | 'success' | 'error' | 'warning' } {
  if (s === 'synced')  return { label: 'Gebucht ✓', color: 'success' };
  if (s === 'pending') return { label: 'Ausstehend', color: 'info' };
  if (s === 'failed')  return { label: 'Fehler', color: 'error' };
  return { label: '—', color: 'default' };
}

interface StaffGroup {
  staffProfileId: string;
  staffName: string;
  timesheets: M2TimesheetRow[];
  totalHours: number;
  totalGross: number;
  totalNet: number;
  pendingSyncCount: number;
  m3PayrollId?: string;
}

function groupByStaff(staff: M2StaffRow[], timesheets: M2TimesheetRow[]): StaffGroup[] {
  // Seed every active staff member so all appear, even without approved timesheets
  const map = new Map<string, StaffGroup>();
  for (const s of staff) {
    map.set(s._id, {
      staffProfileId: s._id,
      staffName: `${s.firstName} ${s.lastName}`,
      timesheets: [], totalHours: 0, totalGross: 0, totalNet: 0, pendingSyncCount: 0,
    });
  }
  for (const ts of timesheets) {
    let g = map.get(ts.staffProfileId);
    if (!g) {
      // Staff member not in the staff list (inactive?) — still show them
      g = {
        staffProfileId: ts.staffProfileId, staffName: ts.staffName,
        timesheets: [], totalHours: 0, totalGross: 0, totalNet: 0, pendingSyncCount: 0,
      };
      map.set(ts.staffProfileId, g);
    }
    g.timesheets.push(ts);
    g.totalHours += ts.totalHours ?? 0;
    g.totalGross += ts.grossPay ?? 0;
    g.totalNet   += ts.netPay ?? 0;
    if (ts.syncStatus !== 'synced') g.pendingSyncCount++;
    if (ts.m3PayrollId && !g.m3PayrollId) g.m3PayrollId = ts.m3PayrollId;
  }
  return [...map.values()].sort((a, b) => a.staffName.localeCompare(b.staffName));
}

interface PaidRecord {
  paymentId: string;
  paidAt: string;
  duplicate?: boolean;
  paidHours?: number;
  totalHours?: number;
  carryForwardHours?: number;
}

interface PayModal {
  open: boolean;
  group: StaffGroup | null;
  hours: number;
  accountNumber: string;
  markAsPaid: boolean;
}

export default function EventStaffPayrollPage() {
  const { i18n } = useTranslation();
  const de     = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';

  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [sessionPaid, setSessionPaid] = useState<Record<string, PaidRecord>>({});
  const [payError, setPayError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [payModal, setPayModal] = useState<PayModal>({ open: false, group: null, hours: 0, accountNumber: '1200', markAsPaid: false });

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['m2-event-staff-payroll', year, month],
    queryFn:  () => integrationsApi.getEventStaffPayroll({ year, month }),
  });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts-asset'],
    queryFn:  () => accountsApi.list({ type: 'asset', active: 'true' }),
    staleTime: 5 * 60 * 1000,
  });
  // Show cash (10xx) and bank (12xx) accounts in the selector
  const paymentAccounts: Account[] = (accountsData?.data?.accounts ?? []).filter(
    (a) => a.isActive && (a.number.startsWith('10') || a.number.startsWith('12'))
  );

  const payMutation = useMutation({
    mutationFn: integrationsApi.payEventStaff,
    onSuccess: (result, vars) => {
      setPayError(null);
      setPayModal({ open: false, group: null, hours: 0, accountNumber: '1200', markAsPaid: false });
      const carryFwd = (vars.markAsPaid && vars.paidHours != null && vars.totalHours != null && vars.paidHours < vars.totalHours)
        ? vars.totalHours - vars.paidHours
        : undefined;
      setSessionPaid((prev) => ({
        ...prev,
        [vars.staffProfileId]: {
          paymentId: result.paymentId,
          paidAt: result.paidAt,
          duplicate: result.duplicate,
          paidHours: vars.paidHours,
          totalHours: vars.totalHours,
          carryForwardHours: carryFwd,
        },
      }));
    },
    onError: () => setPayError(de ? 'Zahlung fehlgeschlagen. Bitte erneut versuchen.' : 'Payment failed. Please try again.'),
  });

  const MONTH_NAMES = de
    ? ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
    : ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const serverPaidMap: Record<string, PaidRecord> = {};
  for (const p of (data?.payments ?? []) as M2PaymentRow[]) {
    serverPaidMap[p.staffProfileId] = { paymentId: p._id, paidAt: p.paidAt, paidHours: p.paidHours, totalHours: p.totalHours, carryForwardHours: p.carryForwardHours };
  }
  const paidMap: Record<string, PaidRecord> = { ...serverPaidMap, ...sessionPaid };

  // Previous month carry-forward: staffProfileId → { hours, ratePerHour }
  const prevCarryMap: Record<string, { hours: number; ratePerHour: number }> = {};
  for (const p of (data?.prevPayments ?? []) as M2PaymentRow[]) {
    if (p.carryForwardHours && p.carryForwardHours > 0) {
      const ratePerHour = (p.paidHours && p.paidHours > 0) ? p.totalAmount / p.paidHours : 0;
      prevCarryMap[p.staffProfileId] = { hours: p.carryForwardHours, ratePerHour };
    }
  }

  const groups = data?.connected ? groupByStaff(data.staff ?? [], data.timesheets) : [];
  const totals = groups.reduce(
    (acc, g) => ({ hours: acc.hours + g.totalHours, gross: acc.gross + g.totalGross, net: acc.net + g.totalNet }),
    { hours: 0, gross: 0, net: 0 }
  );

  function fmtEur(n: number | undefined | null) {
    if (n == null || isNaN(n)) return '—';
    return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  function openPayModal(g: StaffGroup) {
    setPayError(null);
    const prevEntry = prevCarryMap[g.staffProfileId];
    const defaultHours = g.totalHours > 0 ? g.totalHours : (prevEntry?.hours ?? 0);
    setPayModal({ open: true, group: g, hours: defaultHours, accountNumber: '1200', markAsPaid: false });
  }

  function confirmPay() {
    const g = payModal.group;
    if (!g) return;
    const prevEntry = prevCarryMap[g.staffProfileId];
    const maxHours = g.totalHours > 0 ? g.totalHours : (prevEntry?.hours ?? payModal.hours);
    const hoursToPay = Math.max(0, Math.min(payModal.hours, maxHours));
    const effectiveRate = g.totalHours > 0 ? g.totalNet / g.totalHours : (prevEntry?.ratePerHour ?? 0);
    const netAmount = Math.round(hoursToPay * effectiveRate * 100);
    payMutation.mutate({
      staffProfileId:        g.staffProfileId,
      staffName:             g.staffName,
      year,
      month,
      netAmountCents:        netAmount,
      m3PayrollId:           g.m3PayrollId,
      paidHours:             hoursToPay,
      totalHours:            maxHours,
      paymentAccountNumber:  payModal.accountNumber || '1200',
      markAsPaid:            payModal.markAsPaid,
    });
  }

  const payingId = payMutation.isPending ? (payMutation.variables as { staffProfileId: string } | undefined)?.staffProfileId : null;

  function calcModalAmount() {
    const g = payModal.group;
    if (!g) return 0;
    const prevEntry = prevCarryMap[g.staffProfileId];
    const rate = g.totalHours > 0 ? g.totalNet / g.totalHours : (prevEntry?.ratePerHour ?? 0);
    const maxH = g.totalHours > 0 ? g.totalHours : (prevEntry?.hours ?? 0);
    return Math.max(0, Math.min(payModal.hours, maxH)) * rate;
  }

  // For the pay modal: derive max payable hours and effective rate
  // (handles carry-forward-only employees who have no current-month timesheets)
  const modalGroup = payModal.group;
  const modalPrevEntry = modalGroup ? prevCarryMap[modalGroup.staffProfileId] : undefined;
  const modalMaxH = modalGroup
    ? (modalGroup.totalHours > 0 ? modalGroup.totalHours : (modalPrevEntry?.hours ?? 0))
    : 0;
  const modalRate = modalGroup
    ? (modalGroup.totalHours > 0 ? modalGroup.totalNet / modalGroup.totalHours : (modalPrevEntry?.ratePerHour ?? 0))
    : 0;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {de ? 'Event-Personal (M2)' : 'Event Staff (M2)'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {de
              ? 'Live-Übersicht der genehmigten Stundenzettel aus dem Event-Modul'
              : 'Live view of approved timesheets from the event module'}
          </Typography>
        </Box>
      </Stack>

      {/* Period filter */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ py: '12px !important' }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>{de ? 'Monat' : 'Month'}</InputLabel>
              <Select value={month} label={de ? 'Monat' : 'Month'} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTH_NAMES.slice(1).map((name, i) => (
                  <MenuItem key={i + 1} value={i + 1}>{name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>{de ? 'Jahr' : 'Year'}</InputLabel>
              <Select value={year} label={de ? 'Jahr' : 'Year'} onChange={(e) => setYear(Number(e.target.value))}>
                {yearOptions.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
        </CardContent>
      </Card>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden der M2-Daten.' : 'Failed to load M2 data.'}</Alert>}
      {payError  && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPayError(null)}>{payError}</Alert>}

      {!isLoading && !isError && !data?.connected && (
        <Alert severity="warning">
          {de
            ? 'M2-Integration nicht konfiguriert. Bitte richten Sie die Verbindung unter Einstellungen → Integrationen ein.'
            : 'M2 integration not configured. Set up the connection under Settings → Integrations.'}
        </Alert>
      )}

      {data?.connected && groups.length === 0 && !isLoading && (
        <Alert severity="info">
          {de
            ? `Keine genehmigten Stundenzettel für ${MONTH_NAMES[month]} ${year}.`
            : `No approved timesheets for ${MONTH_NAMES[month]} ${year}.`}
        </Alert>
      )}

      {data?.connected && groups.length > 0 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 32 }} />
                <TableCell>{de ? 'Mitarbeiter' : 'Employee'}</TableCell>
                <TableCell>{de ? 'Event' : 'Event'}</TableCell>
                <TableCell align="right">{de ? 'Stunden' : 'Hours'}</TableCell>
                <TableCell align="right">{de ? 'Brutto' : 'Gross'}</TableCell>
                <TableCell align="right">{de ? 'Netto' : 'Net'}</TableCell>
                <TableCell>{de ? 'Buchung' : 'Posting'}</TableCell>
                <TableCell>{de ? 'Genehmigt' : 'Approved'}</TableCell>
                <TableCell align="right">{de ? 'Std. gezahlt' : 'Hrs paid'}</TableCell>
                <TableCell align="right">{de ? 'Vorm. offen' : 'Prev. Pending'}</TableCell>
                <TableCell align="right">{de ? 'Übertrag' : 'Carry Fwd'}</TableCell>
                <TableCell>{de ? 'Zahlung' : 'Payment'}</TableCell>
                <TableCell>{de ? 'Aktion' : 'Action'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map((g) => {
                const paid           = paidMap[g.staffProfileId];
                const paying         = payingId === g.staffProfileId;
                const unsynced       = g.pendingSyncCount > 0;
                const noTimesheets   = g.timesheets.length === 0;
                const hasPrevPending = (prevCarryMap[g.staffProfileId]?.hours ?? 0) > 0;
                const noActivity     = noTimesheets && !hasPrevPending;
                const isOpen         = !!expanded[g.staffProfileId];

                return (
                  <>
                    {/* Group header row */}
                    <TableRow
                      key={`hdr-${g.staffProfileId}`}
                      sx={{ bgcolor: 'action.hover', cursor: noTimesheets ? 'default' : 'pointer' }}
                      onClick={() => { if (!noTimesheets) toggleExpand(g.staffProfileId); }}
                    >
                      <TableCell sx={{ py: 0.5, width: 32 }}>
                        {!noTimesheets && (
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleExpand(g.staffProfileId); }}>
                            {isOpen ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography variant="body2" fontWeight={700} color={noActivity ? 'text.disabled' : 'text.primary'}>
                            {g.staffName}
                          </Typography>
                          {unsynced && (
                            <Chip size="small" label={`${g.pendingSyncCount} ${de ? 'ungebucht' : 'unposted'}`} color="warning" sx={{ height: 18, fontSize: 10 }} />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell />{/* Event column — empty on group header */}
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: noTimesheets ? 'text.disabled' : 'text.primary' }}>
                        {noTimesheets ? '—' : (g.totalHours ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: noTimesheets ? 'text.disabled' : 'text.primary' }}>
                        {noTimesheets ? '—' : fmtEur(g.totalGross)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: noTimesheets ? 'text.disabled' : 'text.primary' }}>
                        {noTimesheets ? '—' : fmtEur(g.totalNet)}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      {/* Hrs Paid column */}
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {paid?.paidHours != null && paid?.totalHours != null ? (
                          <Typography variant="caption" fontWeight={600}
                            sx={{ color: paid.paidHours < paid.totalHours ? '#E65100' : 'success.main' }}>
                            {paid.paidHours.toFixed(2)} / {paid.totalHours.toFixed(2)} h
                          </Typography>
                        ) : '—'}
                      </TableCell>
                      {/* Prev. Pending column */}
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {prevCarryMap[g.staffProfileId] ? (
                          <Chip
                            size="small"
                            label={`${prevCarryMap[g.staffProfileId].hours.toFixed(2)} h`}
                            color="warning"
                            variant="outlined"
                            sx={{ height: 18, fontSize: 10, fontWeight: 600 }}
                          />
                        ) : '—'}
                      </TableCell>
                      {/* Carry Forward column */}
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {paid?.carryForwardHours && paid.carryForwardHours > 0 ? (
                          <Chip
                            size="small"
                            label={`${paid.carryForwardHours.toFixed(2)} h`}
                            color="info"
                            variant="outlined"
                            sx={{ height: 18, fontSize: 10, fontWeight: 600 }}
                          />
                        ) : '—'}
                      </TableCell>
                      {/* Payment status cell */}
                      <TableCell>
                        {noActivity ? (
                          <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                            {de ? 'Keine Einträge' : 'No activity'}
                          </Typography>
                        ) : paid ? (() => {
                          const isPartial = paid.paidHours != null && paid.totalHours != null && paid.paidHours < paid.totalHours && !paid.carryForwardHours;
                          return (
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              {isPartial
                                ? <RemoveCircleOutlineIcon sx={{ fontSize: 16, color: '#E65100' }} />
                                : <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />}
                              <Typography variant="caption" color={isPartial ? '#E65100' : 'success.main'} fontWeight={600}>
                                {isPartial
                                  ? (de ? 'Teilw. bezahlt' : 'Partial')
                                  : paid.duplicate ? (de ? 'Bereits bezahlt' : 'Already paid') : (de ? 'Bezahlt' : 'Paid')}
                              </Typography>
                            </Stack>
                          );
                        })() : (
                          <Tooltip
                            title={unsynced
                              ? (de ? 'Einige Stundenzettel wurden noch nicht gebucht' : 'Some timesheets not yet posted to M3')
                              : ''}
                          >
                            <span>
                              <Button
                                size="small"
                                variant="contained"
                                color="success"
                                disabled={paying}
                                onClick={() => openPayModal(g)}
                                startIcon={paying ? <CircularProgress size={12} color="inherit" /> : undefined}
                                sx={{ whiteSpace: 'nowrap', fontSize: 11 }}
                              >
                                {de ? 'Auszahlen' : 'Pay out'}
                              </Button>
                            </span>
                          </Tooltip>
                        )}
                      </TableCell>
                      {/* Action cell */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {!noActivity && paid && (
                          <Button
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: 10, py: 0, px: 0.75, minWidth: 0 }}
                            onClick={() => openPayModal(g)}
                          >
                            {de ? 'Ändern' : 'Edit'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Collapsible detail rows — rendered in the same table for column alignment */}
                    {!noTimesheets && isOpen && g.timesheets.map((ts) => {
                      const sc = syncChipProps(ts.syncStatus);
                      return (
                        <TableRow key={ts._id} hover>
                          <TableCell sx={{ width: 32 }} />
                          <TableCell sx={{ pl: 3, color: 'text.disabled', fontSize: 11 }}>↳</TableCell>
                          <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>{ts.eventName}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                            {(ts.totalHours ?? 0).toFixed(2)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                            {fmtEur(ts.grossPay)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 600 }}>
                            {fmtEur(ts.netPay)}
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={sc.label} color={sc.color} variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                          </TableCell>
                          <TableCell sx={{ fontSize: 11, color: 'text.secondary' }}>
                            {ts.approvedAt ? new Date(ts.approvedAt).toLocaleDateString(locale) : '—'}
                          </TableCell>
                          <TableCell />{/* Hrs Paid — per-row value lives on the group header */}
                          <TableCell />{/* Prev. Pending */}
                          <TableCell />{/* Carry Fwd */}
                          <TableCell />{/* Payment */}
                          <TableCell />{/* Action */}
                        </TableRow>
                      );
                    })}
                  </>
                );
              })}

              {/* Grand totals */}
              <TableRow sx={{ bgcolor: 'action.selected', '& td': { fontWeight: 700 } }}>
                <TableCell colSpan={3}>{de ? 'Gesamt' : 'Total'}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{(totals.hours ?? 0).toFixed(2)}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtEur(totals.gross)}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtEur(totals.net)}</TableCell>
                <TableCell colSpan={7} />
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      )}

      <Divider sx={{ my: 3 }} />
      <Typography variant="caption" color="text.secondary">
        {de
          ? 'Daten werden live aus dem Event-Modul (M2) abgerufen. "Auszahlen" schreibt die Zahlung in M2 zurück und erstellt dort einen Zahlungsdatensatz mit Quelle M3.'
          : 'Data is fetched live from the event module (M2). "Pay out" writes the payment back to M2 and creates a payment record there with source M3.'}
      </Typography>

      {/* Pay modal */}
      <Dialog open={payModal.open} onClose={() => !payMutation.isPending && setPayModal({ open: false, group: null, hours: 0, accountNumber: '1200', markAsPaid: false })} maxWidth="xs" fullWidth>
        <DialogTitle>{de ? 'Auszahlung' : 'Pay out'}</DialogTitle>
        <DialogContent>
          {payModal.group && (
            <Stack spacing={2} pt={1}>
              <Typography variant="body2">
                <b>{payModal.group.staffName}</b>
              </Typography>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  {payModal.group.totalHours > 0
                    ? (de ? 'Gesamtstunden' : 'Total hours')
                    : (de ? 'Ausstehende Std.' : 'Pending hours')}
                </Typography>
                <Typography variant="body2" fontWeight={600}>{modalMaxH.toFixed(2)} h</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">{de ? 'Stundensatz (netto, eff.)' : 'Effective net rate'}</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {modalRate > 0 ? fmtEur(modalRate) + ' / h' : '—'}
                </Typography>
              </Stack>
              <TextField
                label={de ? 'Zu zahlende Stunden' : 'Hours to pay'}
                type="number"
                size="small"
                fullWidth
                value={payModal.hours}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(Number(e.target.value), modalMaxH));
                  setPayModal((prev) => ({ ...prev, hours: v }));
                }}
                inputProps={{ min: 0, max: modalMaxH, step: 0.5 }}
                InputProps={{ endAdornment: <InputAdornment position="end">h</InputAdornment> }}
                helperText={`Max: ${modalMaxH.toFixed(2)} h`}
              />
              <FormControl size="small" fullWidth>
                <InputLabel>{de ? 'Zahlungskonto' : 'Payment account'}</InputLabel>
                <Select
                  value={payModal.accountNumber}
                  label={de ? 'Zahlungskonto' : 'Payment account'}
                  onChange={(e) => setPayModal((prev) => ({ ...prev, accountNumber: e.target.value }))}
                >
                  {paymentAccounts.length === 0 && (
                    <MenuItem value="1200">1200 – Bank</MenuItem>
                  )}
                  {paymentAccounts.map((a) => (
                    <MenuItem key={a._id} value={a.number}>
                      {a.number} – {a.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Stack direction="row" justifyContent="space-between" sx={{ bgcolor: 'action.hover', borderRadius: 1, px: 1.5, py: 1 }}>
                <Typography variant="body2" fontWeight={600}>{de ? 'Auszahlungsbetrag' : 'Payment amount'}</Typography>
                <Typography variant="body2" fontWeight={700} color="success.main">{fmtEur(calcModalAmount())}</Typography>
              </Stack>
              {payModal.hours < modalMaxH && (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                    {de
                      ? `${(modalMaxH - payModal.hours).toFixed(2)} h verbleiben — als was kennzeichnen?`
                      : `${(modalMaxH - payModal.hours).toFixed(2)} h remaining — mark as?`}
                  </Typography>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    fullWidth
                    value={payModal.markAsPaid ? 'paid' : 'partial'}
                    onChange={(_e, v) => { if (v) setPayModal((prev) => ({ ...prev, markAsPaid: v === 'paid' })); }}
                  >
                    <ToggleButton value="partial" sx={{ fontSize: 11 }}>
                      {de ? 'Teilzahlung (offen)' : 'Partial (open)'}
                    </ToggleButton>
                    <ToggleButton value="paid" sx={{ fontSize: 11 }}>
                      {de ? 'Bezahlt + Übertrag' : 'Paid + carry forward'}
                    </ToggleButton>
                  </ToggleButtonGroup>
                  {payModal.markAsPaid && (
                    <Alert severity="info" sx={{ py: 0.5, fontSize: 11, mt: 1 }}>
                      {de
                        ? `${(modalMaxH - payModal.hours).toFixed(2)} h werden in M3 als Rechnungsabgrenzung (Übertrag) auf nächsten Monat eingestellt.`
                        : `${(modalMaxH - payModal.hours).toFixed(2)} h will be posted as an accrual (carry-forward) to next month in M3.`}
                    </Alert>
                  )}
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayModal({ open: false, group: null, hours: 0, accountNumber: '1200', markAsPaid: false })} disabled={payMutation.isPending}>
            {de ? 'Abbrechen' : 'Cancel'}
          </Button>
          <Button
            variant="contained"
            color="success"
            disabled={payMutation.isPending || !payModal.hours}
            onClick={confirmPay}
            startIcon={payMutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {de ? 'Bestätigen' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
