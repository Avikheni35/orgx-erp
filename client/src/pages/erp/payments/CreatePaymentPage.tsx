import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, TextField,
  ToggleButton, ToggleButtonGroup, Alert, CircularProgress,
  Autocomplete, Table, TableHead, TableBody, TableRow, TableCell,
  IconButton, Chip, Tooltip, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useTranslation } from 'react-i18next';
import { paymentsApi, type PaymentCreate, type PaymentAllocation } from '../../../api/payments';
import { customersApi, type Customer } from '../../../api/customers';
import { suppliersApi, type Supplier } from '../../../api/suppliers';
import { accountsApi } from '../../../api/accounts';
import apiClient from '../../../api/client';

const FALLBACK_DEBTOR   = '1400';
const FALLBACK_CREDITOR = '1600';
const FALLBACK_BANK     = '1200';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function centsFromStr(s: string): number {
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

interface OpenInvoice {
  _id:             string;
  invoiceNumber:   string;
  companyName:     string;
  openCents:       number;
  dueDate:         string;
  customerId?:     string;
  supplierId?:     string;
  type:            'SalesInvoice' | 'VendorInvoice';
}

export default function CreatePaymentPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const navigate = useNavigate();

  const [direction,      setDirection]      = useState<'incoming' | 'outgoing'>('incoming');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [date,           setDate]           = useState(() => new Date().toISOString().slice(0, 10));
  const [amountStr,      setAmountStr]      = useState('');
  const [bankAccount,    setBankAccount]    = useState('');
  const [counterAccount, setCounterAccount] = useState('');
  const [description,    setDescription]   = useState('');
  const [allocations,    setAllocations]   = useState<PaymentAllocation[]>([]);
  const [allocAmounts,   setAllocAmounts]  = useState<Record<string, string>>({});
  const [error,          setError]         = useState('');

  // Load customers / suppliers
  const { data: custData } = useQuery({
    queryKey: ['customers-all'],
    queryFn:  () => customersApi.list({ limit: 500, active: true }),
    enabled:  direction === 'incoming',
  });
  const { data: suppData } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn:  () => suppliersApi.list({ limit: 500, active: true }),
    enabled:  direction === 'outgoing',
  });

  const customers = custData?.data?.customers ?? [];
  const suppliers = suppData?.data?.suppliers ?? [];

  // Load bank accounts from chart of accounts
  const { data: acctData } = useQuery({
    queryKey: ['accounts'],
    queryFn:  () => accountsApi.list(),
  });
  const bankAccounts = useMemo(
    () => (acctData?.data?.accounts ?? []).filter(a => a.isActive),
    [acctData]
  );

  // Auto-fill counter account when party is selected
  useEffect(() => {
    if (direction === 'incoming' && selectedCustomer) {
      setCounterAccount(selectedCustomer.debtorAccount || FALLBACK_DEBTOR);
    }
  }, [selectedCustomer, direction]);

  useEffect(() => {
    if (direction === 'outgoing' && selectedSupplier) {
      setCounterAccount(selectedSupplier.creditorAccount || FALLBACK_CREDITOR);
    }
  }, [selectedSupplier, direction]);

  // Reset party + allocations when direction flips
  useEffect(() => {
    setSelectedCustomer(null);
    setSelectedSupplier(null);
    setAllocations([]);
    setAllocAmounts({});
    setCounterAccount('');
  }, [direction]);

  // Load open invoices for the selected party
  const partyId = direction === 'incoming' ? selectedCustomer?._id : selectedSupplier?._id;

  const { data: openData, isLoading: openLoading } = useQuery({
    queryKey: ['open-invoices-payment', direction, partyId],
    queryFn:  async () => {
      const endpoint = direction === 'incoming' ? '/reports/ar' : '/reports/ap';
      const r = await apiClient.get<unknown>(endpoint);
      const raw = (r.data as { items: unknown[] }).items as Record<string, unknown>[];
      return raw.map(i => ({
        _id:           i._id as string,
        invoiceNumber: i.invoiceNumber as string,
        companyName:   i.companyName as string,
        openCents:     i.openCents as number,
        dueDate:       i.dueDate as string,
        customerId:    i.customerId as string | undefined,
        supplierId:    i.supplierId as string | undefined,
        type:          direction === 'incoming' ? 'SalesInvoice' : 'VendorInvoice',
      })) as OpenInvoice[];
    },
    enabled: !!partyId,
  });

  const openInvoices = useMemo(() => {
    if (!openData) return [];
    if (!partyId)  return openData;
    return openData.filter(inv =>
      direction === 'incoming'
        ? inv.customerId === partyId
        : inv.supplierId === partyId
    );
  }, [openData, partyId, direction]);

  const notYetAllocated = useMemo(
    () => openInvoices.filter(inv => !allocations.some(a => a.invoiceId === inv._id)),
    [openInvoices, allocations]
  );

  const amountCents = centsFromStr(amountStr);
  const allocTotal  = allocations.reduce((s, a) => s + a.amountCents, 0);
  const unallocated = amountCents - allocTotal;

  function addAllocation(inv: OpenInvoice) {
    const suggest = Math.min(inv.openCents, unallocated > 0 ? unallocated : inv.openCents);
    setAllocations(prev => [...prev, {
      invoiceType:   inv.type,
      invoiceId:     inv._id,
      invoiceNumber: inv.invoiceNumber,
      amountCents:   suggest,
    }]);
    setAllocAmounts(prev => ({ ...prev, [inv._id]: (suggest / 100).toFixed(2) }));
  }

  function removeAllocation(invoiceId: string) {
    setAllocations(prev => prev.filter(a => a.invoiceId !== invoiceId));
    setAllocAmounts(prev => { const n = { ...prev }; delete n[invoiceId]; return n; });
  }

  function updateAllocAmount(invoiceId: string, val: string) {
    setAllocAmounts(prev => ({ ...prev, [invoiceId]: val }));
    setAllocations(prev => prev.map(a =>
      a.invoiceId === invoiceId ? { ...a, amountCents: centsFromStr(val) } : a
    ));
  }

  const mutation = useMutation({
    mutationFn: (body: PaymentCreate) => paymentsApi.create(body),
    onSuccess: (res) => navigate(`/erp/zahlungen/${res.data._id}`),
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? (de ? 'Fehler beim Speichern.' : 'Failed to save.'));
    },
  });

  function handleSubmit() {
    setError('');
    if (direction === 'incoming' && !selectedCustomer)
      return setError(de ? 'Bitte Debitor (Kunde) auswählen.' : 'Please select a customer.');
    if (direction === 'outgoing' && !selectedSupplier)
      return setError(de ? 'Bitte Kreditor (Lieferant) auswählen.' : 'Please select a supplier.');
    if (!date)            return setError(de ? 'Datum erforderlich.' : 'Date required.');
    if (amountCents < 1)  return setError(de ? 'Betrag muss > 0 sein.' : 'Amount must be > 0.');
    if (!bankAccount)     return setError(de ? 'Bankkonto erforderlich.' : 'Bank account required.');
    if (!counterAccount)  return setError(de ? 'Gegenkonto (Debitor/Kreditor) fehlt.' : 'Counter account (debtor/creditor) required.');
    if (!description)     return setError(de ? 'Beschreibung erforderlich.' : 'Description required.');
    if (allocTotal > amountCents)
      return setError(de ? 'Zuordnungen übersteigen Zahlungsbetrag.' : 'Allocations exceed payment amount.');

    mutation.mutate({ date, direction, amountCents, bankAccount, counterAccount, description, allocations });
  }

  const counterAccountObj = bankAccounts.find(a => a.number === counterAccount) ?? null;
  const bankAccountObj    = bankAccounts.find(a => a.number === bankAccount) ?? null;

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/zahlungen')}>
          {de ? 'Zahlungen' : 'Payments'}
        </Button>
        <Typography variant="h5" fontWeight={700} ml={1}>
          {de ? 'Neue Zahlung erfassen' : 'Record payment'}
        </Typography>
      </Stack>

      <Stack gap={3}>
        {/* Step 1 — Direction */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>
              {de ? '1. Zahlungsrichtung' : '1. Direction'}
            </Typography>
            <ToggleButtonGroup exclusive value={direction} onChange={(_, v) => v && setDirection(v)}>
              <ToggleButton value="incoming" color="success" sx={{ gap: 1 }}>
                <ArrowDownwardIcon fontSize="small" />
                {de ? 'Geldeingang — Debitor (Kunde zahlt)' : 'Incoming — customer pays AR invoice'}
              </ToggleButton>
              <ToggleButton value="outgoing" color="error" sx={{ gap: 1 }}>
                <ArrowUpwardIcon fontSize="small" />
                {de ? 'Geldausgang — Kreditor (wir zahlen Lieferant)' : 'Outgoing — we pay supplier AP invoice'}
              </ToggleButton>
            </ToggleButtonGroup>
          </CardContent>
        </Card>

        {/* Step 2 — Party selection */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>
              {direction === 'incoming'
                ? (de ? '2. Debitor (Kunde) auswählen' : '2. Select customer (debtor)')
                : (de ? '2. Kreditor (Lieferant) auswählen' : '2. Select supplier (creditor)')}
            </Typography>

            {direction === 'incoming' ? (
              <Autocomplete
                size="small"
                options={customers}
                getOptionLabel={c => `${c.customerNumber} – ${c.companyName}`}
                value={selectedCustomer}
                onChange={(_, v) => setSelectedCustomer(v)}
                renderInput={(params) => (
                  <TextField {...params} label={de ? 'Kunde / Debitor' : 'Customer / debtor'} />
                )}
                renderOption={(props, c) => (
                  <li {...props} key={c._id}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{c.companyName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c.customerNumber}
                        {c.debtorAccount && ` · Konto ${c.debtorAccount}`}
                      </Typography>
                    </Box>
                  </li>
                )}
              />
            ) : (
              <Autocomplete
                size="small"
                options={suppliers}
                getOptionLabel={s => `${s.supplierNumber} – ${s.companyName}`}
                value={selectedSupplier}
                onChange={(_, v) => setSelectedSupplier(v)}
                renderInput={(params) => (
                  <TextField {...params} label={de ? 'Lieferant / Kreditor' : 'Supplier / creditor'} />
                )}
                renderOption={(props, s) => (
                  <li {...props} key={s._id}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{s.companyName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {s.supplierNumber}
                        {s.creditorAccount && ` · Konto ${s.creditorAccount}`}
                      </Typography>
                    </Box>
                  </li>
                )}
              />
            )}

            {/* Show auto-filled counter account */}
            {counterAccount && (
              <Stack direction="row" alignItems="center" gap={1} mt={1.5}>
                <InfoOutlinedIcon fontSize="small" color="primary" />
                <Typography variant="caption" color="text.secondary">
                  {de ? 'Gegenkonto automatisch gesetzt:' : 'Counter account auto-filled:'}
                  {' '}
                  <strong>{counterAccount}</strong>
                  {counterAccountObj && ` – ${counterAccountObj.name}`}
                  {!counterAccountObj && (de ? ' (Konto nicht im Kontenplan — bitte prüfen)' : ' (not in chart of accounts — please check)')}
                </Typography>
                <Button size="small" sx={{ ml: 'auto', flexShrink: 0 }} onClick={() => {}}>
                  {/* Inline override via Autocomplete below */}
                </Button>
              </Stack>
            )}

            {/* Override counter account if needed */}
            {(selectedCustomer || selectedSupplier) && (
              <Autocomplete
                size="small"
                sx={{ mt: 1.5 }}
                options={bankAccounts}
                getOptionLabel={a => `${a.number} – ${a.name}`}
                value={counterAccountObj}
                onChange={(_, v) => setCounterAccount(v?.number ?? '')}
                renderInput={(params) => (
                  <TextField {...params}
                    label={direction === 'incoming'
                      ? (de ? 'Debitorenkonto (überschreiben)' : 'Debtor account (override)')
                      : (de ? 'Kreditorenkonto (überschreiben)' : 'Creditor account (override)')}
                  />
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* Step 3 — Payment details */}
        {(selectedCustomer || selectedSupplier) && (
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>
                {de ? '3. Zahlungsdetails' : '3. Payment details'}
              </Typography>
              <Stack gap={2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                  <TextField
                    label={de ? 'Datum' : 'Date'}
                    type="date"
                    size="small"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label={de ? 'Betrag (€)' : 'Amount (€)'}
                    size="small"
                    value={amountStr}
                    onChange={e => setAmountStr(e.target.value)}
                    placeholder="0,00"
                    sx={{ flex: 1 }}
                  />
                </Stack>

                <Autocomplete
                  size="small"
                  options={bankAccounts}
                  getOptionLabel={a => `${a.number} – ${a.name}`}
                  value={bankAccountObj}
                  onChange={(_, v) => setBankAccount(v?.number ?? '')}
                  renderInput={(params) => (
                    <TextField {...params} label={de ? 'Bankkonto / Kasse (Zahlungsmittelkonto)' : 'Bank / cash account'} />
                  )}
                  noOptionsText={
                    <Box>
                      <Typography variant="body2">{de ? 'Kein Konto gefunden.' : 'No account found.'}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {de ? `Standard: ${FALLBACK_BANK} (Kasse)` : `Default: ${FALLBACK_BANK} (cash)`}
                      </Typography>
                    </Box>
                  }
                />

                <TextField
                  label={de ? 'Verwendungszweck / Beschreibung' : 'Description / reference'}
                  size="small"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  multiline
                  rows={2}
                />
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Step 4 — Invoice allocation */}
        {(selectedCustomer || selectedSupplier) && (
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Box>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {de ? '4. Offene Rechnungen zuordnen (optional)' : '4. Allocate open invoices (optional)'}
                  </Typography>
                  {amountCents > 0 && (
                    <Typography variant="caption" color={unallocated < 0 ? 'error.main' : 'text.secondary'}>
                      {de ? 'Noch nicht zugeordnet:' : 'Unallocated:'}{' '}
                      <strong>{fmtCents(Math.max(0, unallocated), locale)}</strong>
                      {unallocated < 0 && (de ? ' — Betrag überschritten!' : ' — exceeds payment!')}
                    </Typography>
                  )}
                </Box>
                {openLoading && <CircularProgress size={18} />}
              </Stack>

              {/* Allocated rows */}
              {allocations.length > 0 && (
                <>
                  <Box sx={{ overflowX: 'auto', mb: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{de ? 'Rechnung' : 'Invoice'}</TableCell>
                          <TableCell align="right">{de ? 'Offen' : 'Open'}</TableCell>
                          <TableCell align="right">{de ? 'Zuordnung (€)' : 'Allocation (€)'}</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {allocations.map(alloc => {
                          const inv = openInvoices.find(i => i._id === alloc.invoiceId);
                          return (
                            <TableRow key={alloc.invoiceId}>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{alloc.invoiceNumber}</TableCell>
                              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                {inv ? fmtCents(inv.openCents, locale) : '—'}
                              </TableCell>
                              <TableCell align="right">
                                <TextField
                                  size="small"
                                  value={allocAmounts[alloc.invoiceId] ?? ''}
                                  onChange={e => updateAllocAmount(alloc.invoiceId, e.target.value)}
                                  sx={{ width: 110 }}
                                  inputProps={{ style: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }}
                                />
                              </TableCell>
                              <TableCell>
                                <Tooltip title={de ? 'Entfernen' : 'Remove'}>
                                  <IconButton size="small" onClick={() => removeAllocation(alloc.invoiceId)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Box>
                  <Divider sx={{ mb: 2 }} />
                </>
              )}

              {/* Available open invoices */}
              {!openLoading && notYetAllocated.length > 0 && (
                <Stack gap={0.75}>
                  {notYetAllocated.map(inv => (
                    <Stack key={inv._id} direction="row" alignItems="center" justifyContent="space-between"
                      sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                      <Box>
                        <Typography variant="body2" fontFamily="monospace" fontWeight={600}>{inv.invoiceNumber}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {de ? 'Fällig:' : 'Due:'} {new Date(inv.dueDate).toLocaleDateString(locale)}
                        </Typography>
                      </Box>
                      <Stack direction="row" alignItems="center" gap={1}>
                        <Chip size="small" label={fmtCents(inv.openCents, locale)} variant="outlined"
                          color={new Date(inv.dueDate) < new Date() ? 'error' : 'default'} />
                        <Button size="small" startIcon={<AddIcon />} onClick={() => addAllocation(inv)}>
                          {de ? 'Zuordnen' : 'Allocate'}
                        </Button>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              )}

              {!openLoading && openInvoices.length === 0 && partyId && (
                <Typography variant="body2" color="text.disabled">
                  {de ? 'Keine offenen Rechnungen für diesen Debitor/Kreditor.' : 'No open invoices for this party.'}
                </Typography>
              )}
            </CardContent>
          </Card>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {(selectedCustomer || selectedSupplier) && (
          <Stack direction="row" gap={2} justifyContent="flex-end">
            <Button variant="outlined" onClick={() => navigate('/erp/zahlungen')}>
              {de ? 'Abbrechen' : 'Cancel'}
            </Button>
            <Button variant="contained" disabled={mutation.isPending} onClick={handleSubmit}>
              {mutation.isPending ? <CircularProgress size={20} /> : (de ? 'Zahlung buchen' : 'Post payment')}
            </Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
