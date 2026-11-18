import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, TextField, Select,
  MenuItem, FormControl, InputLabel, Grid, Alert, CircularProgress,
  Table, TableHead, TableBody, TableRow, TableCell, IconButton, Autocomplete, Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import { salesOrdersApi, type CreateOrderPayload } from '../../../api/salesOrders';
import { customersApi, type Customer } from '../../../api/customers';
import QuickCreateCustomerDialog from '../../../components/QuickCreateCustomerDialog';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

type LineForm = {
  description:    string;
  unit:           string;
  quantity:       string;
  unitPriceCents: string;
  vatRate:        number;
};

const emptyLine = (): LineForm => ({
  description: '', unit: 'Stück', quantity: '1', unitPriceCents: '', vatRate: 19,
});

function calcLine(l: LineForm) {
  const qty     = parseFloat(l.quantity) || 0;
  const price   = Math.round(parseFloat(l.unitPriceCents.replace(',', '.')) * 100 || 0);
  const net     = Math.round(qty * price);
  const vat     = Math.round(net * l.vatRate / 100);
  return { quantity: qty, unitPriceCents: price, totalNetCents: net, totalVatCents: vat, totalGrossCents: net + vat };
}

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function CreateSalesOrderPage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [customerId,       setCustomerId]       = useState('');
  const [quickCustOpen,    setQuickCustOpen]    = useState(false);
  const [orderDate,        setOrderDate]        = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate,     setDeliveryDate]     = useState('');
  const [deliveryAddress,  setDeliveryAddress]  = useState('');
  const [notes,            setNotes]            = useState('');
  const [internalNotes,    setInternalNotes]    = useState('');
  const [lines,            setLines]            = useState<LineForm[]>([emptyLine()]);
  const [error,            setError]            = useState('');

  const { data: custData } = useQuery({
    queryKey: ['customers', 'active'],
    queryFn:  () => customersApi.list({ active: true }),
  });
  const customers = custData?.data?.customers ?? [];

  const totals = lines.reduce((acc, l) => {
    const c = calcLine(l);
    return { net: acc.net + c.totalNetCents, vat: acc.vat + c.totalVatCents, gross: acc.gross + c.totalGrossCents };
  }, { net: 0, vat: 0, gross: 0 });

  const setLine = <K extends keyof LineForm>(i: number, k: K, v: LineForm[K]) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  const mutation = useMutation({
    mutationFn: () => {
      const payload: CreateOrderPayload = {
        customerId, orderDate,
        deliveryDate: deliveryDate || undefined,
        lineItems: lines.map(l => {
          const c = calcLine(l);
          return { description: l.description, unit: l.unit, quantity: c.quantity, unitPriceCents: c.unitPriceCents, vatRate: l.vatRate };
        }),
        deliveryAddress, notes, internalNotes,
      };
      return salesOrdersApi.create(payload);
    },
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      navigate(`/erp/verkauf/auftraege/${res.data._id}`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  function validate() {
    if (!customerId)       { setError(de ? 'Kunde auswählen.' : 'Select a customer.'); return false; }
    if (lines.length === 0) { setError(de ? 'Mind. eine Position.' : 'Add at least one line.'); return false; }
    return true;
  }

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="center" gap={2} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/verkauf/auftraege')} size="small">
          {de ? 'Aufträge' : 'Orders'}
        </Button>
        <Typography variant="h5" fontWeight={700} flex={1}>
          {de ? 'Neuer Auftrag' : 'New sales order'}
        </Typography>
        <Button variant="contained"
          startIcon={mutation.isPending ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
          disabled={mutation.isPending} onClick={() => { if (validate()) mutation.mutate(); }}>
          {de ? 'Speichern' : 'Save'}
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack gap={3}>
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Auftragsdaten' : 'Order details'}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Stack direction="row" gap={1} alignItems="flex-start">
                  <Autocomplete
                    size="small"
                    fullWidth
                    options={customers}
                    getOptionLabel={c => c.companyName}
                    value={customers.find(c => c._id === customerId) ?? null}
                    onChange={(_, v) => setCustomerId(v?._id ?? '')}
                    renderInput={params => <TextField {...params} label={`${de ? 'Kunde' : 'Customer'} *`} />}
                  />
                  <Tooltip title={de ? 'Neuen Kunden anlegen' : 'Create new customer'}>
                    <IconButton size="small" onClick={() => setQuickCustOpen(true)} sx={{ mt: 0.25, flexShrink: 0 }}>
                      <PersonAddIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField label={`${de ? 'Auftragsdatum' : 'Order date'} *`} type="date" size="small" fullWidth
                  value={orderDate} onChange={e => setOrderDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField label={de ? 'Lieferdatum' : 'Delivery date'} type="date" size="small" fullWidth
                  value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12}>
                <TextField label={de ? 'Lieferadresse' : 'Delivery address'} size="small" fullWidth multiline rows={2}
                  value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)}
                  placeholder={de ? 'Leer lassen für Rechnungsadresse des Kunden' : 'Leave blank to use customer billing address'} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Typography variant="subtitle2" color="text.secondary">{de ? 'Positionen' : 'Line items'}</Typography>
            </Stack>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ minWidth: 220 }}>{de ? 'Beschreibung' : 'Description'}</TableCell>
                    <TableCell sx={{ width: 90 }}>{de ? 'Einheit' : 'Unit'}</TableCell>
                    <TableCell sx={{ width: 90 }}>{de ? 'Menge' : 'Qty'}</TableCell>
                    <TableCell sx={{ width: 130 }}>{de ? 'Einzelpreis (€)' : 'Unit price (€)'}</TableCell>
                    <TableCell sx={{ width: 80 }}>{de ? 'MwSt.' : 'VAT'}</TableCell>
                    <TableCell align="right" sx={{ width: 120 }}>{de ? 'Gesamt (netto)' : 'Total (net)'}</TableCell>
                    <TableCell sx={{ width: 40 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((line, i) => {
                    const c = calcLine(line);
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <TextField size="small" fullWidth value={line.description}
                            onChange={e => setLine(i, 'description', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" sx={{ width: 80 }} value={line.unit}
                            onChange={e => setLine(i, 'unit', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" type="number" sx={{ width: 80 }} value={line.quantity}
                            onChange={e => setLine(i, 'quantity', e.target.value)}
                            inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" type="number" sx={{ width: 120 }} value={line.unitPriceCents}
                            onChange={e => setLine(i, 'unitPriceCents', e.target.value)}
                            inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right', fontFamily: 'monospace' } }}
                            placeholder="0,00" />
                        </TableCell>
                        <TableCell>
                          <FormControl size="small" sx={{ width: 70 }}>
                            <Select value={line.vatRate} onChange={e => setLine(i, 'vatRate', Number(e.target.value))}>
                              <MenuItem value={0}>0%</MenuItem>
                              <MenuItem value={7}>7%</MenuItem>
                              <MenuItem value={19}>19%</MenuItem>
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fmtCents(c.totalNetCents, locale)}
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" disabled={lines.length <= 1}
                            onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 600, pr: 2 }}>{de ? 'Netto' : 'Net'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtCents(totals.net, locale)}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 600, pr: 2 }}>{de ? 'MwSt.' : 'VAT'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(totals.vat, locale)}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 700, pr: 2, fontSize: '0.95rem' }}>{de ? 'Gesamt (brutto)' : 'Total (gross)'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '0.95rem' }}>{fmtCents(totals.gross, locale)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
            <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1 }} onClick={() => setLines(ls => [...ls, emptyLine()])}>
              {de ? 'Position hinzufügen' : 'Add line'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField label={de ? 'Notizen (Kunde sieht)' : 'Notes (visible to customer)'} size="small" fullWidth
                  multiline rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={de ? 'Interne Notizen' : 'Internal notes'} size="small" fullWidth
                  multiline rows={3} value={internalNotes} onChange={e => setInternalNotes(e.target.value)} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Stack>

      <QuickCreateCustomerDialog
        open={quickCustOpen}
        onClose={() => setQuickCustOpen(false)}
        onCreated={(c: Customer) => {
          qc.invalidateQueries({ queryKey: ['customers'] });
          setCustomerId(c._id);
        }}
      />
    </Box>
  );
}
