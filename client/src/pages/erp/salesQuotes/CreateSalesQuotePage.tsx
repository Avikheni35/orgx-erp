import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, TextField, Select,
  MenuItem, FormControl, InputLabel, Grid, Alert, CircularProgress,
  Table, TableHead, TableBody, TableRow, TableCell, IconButton, Divider,
  Autocomplete, Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import { salesQuotesApi, type QuoteLineItemInput } from '../../../api/salesQuotes';
import { customersApi, type Customer } from '../../../api/customers';
import QuickCreateCustomerDialog from '../../../components/QuickCreateCustomerDialog';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

interface LineForm {
  description:    string;
  unit:           string;
  quantityStr:    string;
  unitPriceStr:   string;
  vatRate:        number;
}

const emptyLine = (): LineForm => ({ description: '', unit: 'Stück', quantityStr: '1', unitPriceStr: '', vatRate: 19 });

function calcLine(l: LineForm) {
  const qty      = parseFloat(l.quantityStr)  || 0;
  const price    = parseFloat(l.unitPriceStr.replace(',', '.')) || 0;
  const netCents = Math.round(qty * price * 100);
  const vatCents = Math.round(netCents * l.vatRate / 100);
  return { netCents, vatCents, grossCents: netCents + vatCents };
}

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// default valid-until = today + 30 days
function defaultValidUntil() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export default function CreateSalesQuotePage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [customerId,     setCustomerId]     = useState('');
  const [quickCustOpen,  setQuickCustOpen]  = useState(false);
  const [quoteDate,      setQuoteDate]      = useState(new Date().toISOString().slice(0, 10));
  const [validUntil,     setValidUntil]     = useState(defaultValidUntil());
  const [notes,          setNotes]          = useState('');
  const [internalNotes,  setInternalNotes]  = useState('');
  const [lines,          setLines]          = useState<LineForm[]>([emptyLine()]);
  const [error,          setError]          = useState('');

  const { data: custData } = useQuery({
    queryKey: ['customers', 'active'],
    queryFn:  () => customersApi.list({ active: true }),
  });
  const customers = custData?.data?.customers ?? [];

  const totals = lines.reduce(
    (acc, l) => {
      const { netCents, vatCents, grossCents } = calcLine(l);
      return { net: acc.net + netCents, vat: acc.vat + vatCents, gross: acc.gross + grossCents };
    },
    { net: 0, vat: 0, gross: 0 }
  );

  const setLine = <K extends keyof LineForm>(i: number, k: K, v: LineForm[K]) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  function buildLines(): QuoteLineItemInput[] {
    return lines.map(l => ({
      description:    l.description,
      unit:           l.unit,
      quantity:       parseFloat(l.quantityStr) || 1,
      unitPriceCents: Math.round(parseFloat(l.unitPriceStr.replace(',', '.')) * 100 || 0),
      vatRate:        l.vatRate,
    }));
  }

  const mutation = useMutation({
    mutationFn: () => salesQuotesApi.create({ customerId, quoteDate, validUntil, notes, internalNotes, lineItems: buildLines() }),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['sales-quotes'] });
      navigate(`/erp/verkauf/angebote/${res.data._id}`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  function validate() {
    if (!customerId) { setError(de ? 'Kunde auswählen.' : 'Select a customer.'); return false; }
    if (!quoteDate || !validUntil) { setError(de ? 'Daten ausfüllen.' : 'Fill in dates.'); return false; }
    if (lines.length === 0) { setError(de ? 'Mindestens eine Position.' : 'Add at least one line.'); return false; }
    return true;
  }

  const selectedCustomer = customers.find(c => c._id === customerId) ?? null;

  return (
    <Box maxWidth={960}>
      <Stack direction="row" alignItems="center" gap={2} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/verkauf/angebote')} size="small">
          {de ? 'Angebote' : 'Quotes'}
        </Button>
        <Typography variant="h5" fontWeight={700} flex={1}>{de ? 'Neues Angebot' : 'New quote'}</Typography>
        <Button variant="contained"
          startIcon={mutation.isPending ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
          disabled={mutation.isPending} onClick={() => { if (validate()) mutation.mutate(); }}>
          {de ? 'Speichern' : 'Save'}
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack gap={3}>
        {/* Header */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Angebotskopf' : 'Quote header'}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Stack direction="row" gap={1} alignItems="flex-start">
                  <Autocomplete
                    size="small"
                    fullWidth
                    options={customers}
                    getOptionLabel={c => `${c.companyName} (${c.customerNumber})`}
                    value={selectedCustomer}
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
                <TextField label={de ? 'Angebotsdatum' : 'Quote date'} type="date" size="small" fullWidth
                  value={quoteDate} onChange={e => setQuoteDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField label={de ? 'Gültig bis' : 'Valid until'} type="date" size="small" fullWidth
                  value={validUntil} onChange={e => setValidUntil(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={1.5}>{de ? 'Positionen' : 'Line items'}</Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{de ? 'Bezeichnung' : 'Description'}</TableCell>
                    <TableCell sx={{ width: 80 }}>{de ? 'Einheit' : 'Unit'}</TableCell>
                    <TableCell sx={{ width: 80 }}>{de ? 'Menge' : 'Qty'}</TableCell>
                    <TableCell sx={{ width: 120 }}>{de ? 'EP netto (€)' : 'Unit price (€)'}</TableCell>
                    <TableCell sx={{ width: 80 }}>{de ? 'MwSt.' : 'VAT'}</TableCell>
                    <TableCell align="right" sx={{ width: 120 }}>{de ? 'Gesamt' : 'Total'}</TableCell>
                    <TableCell sx={{ width: 40 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((line, i) => {
                    const { grossCents } = calcLine(line);
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <TextField size="small" fullWidth value={line.description}
                            onChange={e => setLine(i, 'description', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" sx={{ width: 70 }} value={line.unit}
                            onChange={e => setLine(i, 'unit', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" type="number" sx={{ width: 70 }} value={line.quantityStr}
                            onChange={e => setLine(i, 'quantityStr', e.target.value)}
                            inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" sx={{ width: 110 }} value={line.unitPriceStr}
                            onChange={e => setLine(i, 'unitPriceStr', e.target.value)}
                            placeholder="0,00"
                            inputProps={{ style: { textAlign: 'right', fontFamily: 'monospace' } }} />
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
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {grossCents > 0 ? money(grossCents, locale) : '—'}
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
                </TableBody>
              </Table>
            </Box>
            <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1 }}
              onClick={() => setLines(ls => [...ls, emptyLine()])}>
              {de ? 'Position hinzufügen' : 'Add line'}
            </Button>

            <Divider sx={{ my: 2 }} />
            <Stack alignItems="flex-end" gap={0.5}>
              <Typography variant="body2">{de ? 'Netto:' : 'Net:'} <strong>{money(totals.net, locale)}</strong></Typography>
              <Typography variant="body2" color="text.secondary">{de ? 'MwSt.:' : 'VAT:'} {money(totals.vat, locale)}</Typography>
              <Typography variant="h6" fontWeight={700}>{de ? 'Brutto:' : 'Total:'} {money(totals.gross, locale)}</Typography>
            </Stack>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary" mb={1}>{de ? 'Anmerkungen (für Kunden)' : 'Notes (for customer)'}</Typography>
                <TextField size="small" fullWidth multiline rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary" mb={1}>{de ? 'Interne Notizen' : 'Internal notes'}</Typography>
                <TextField size="small" fullWidth multiline rows={3} value={internalNotes} onChange={e => setInternalNotes(e.target.value)} />
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
