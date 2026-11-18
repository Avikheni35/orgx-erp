import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, TextField, Select,
  MenuItem, FormControl, InputLabel, Grid, Alert, CircularProgress,
  Table, TableHead, TableBody, TableRow, TableCell, IconButton, Chip,
  Autocomplete,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import { travelExpensesApi, type ExpenseCategory, type ExpenseLine, type TravelExpenseCreate } from '../../../api/travelExpenses';
import { employeesApi } from '../../../api/employees';

const KM_RATE_CENTS = 30; // 0,30 € / km (§9 EStG pauschale)

const CATEGORY_LABELS: Record<ExpenseCategory, { de: string; en: string }> = {
  mileage:   { de: 'Km-Pauschale',  en: 'Mileage' },
  hotel:     { de: 'Hotel/Übernachtung', en: 'Hotel/Accommodation' },
  meal:      { de: 'Verpflegung',   en: 'Meals' },
  transport: { de: 'Fahrtkosten',   en: 'Transport' },
  parking:   { de: 'Parkgebühren', en: 'Parking' },
  other:     { de: 'Sonstige',      en: 'Other' },
};

type LineForm = {
  category:      ExpenseCategory;
  description:   string;
  amountStr:     string;
  vatRate:       number;
  receiptNumber: string;
  kmStr:         string;
};

const emptyLine = (): LineForm => ({
  category: 'other', description: '', amountStr: '', vatRate: 0, receiptNumber: '', kmStr: '',
});

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function CreateTravelExpensePage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [employeeId,  setEmployeeId]  = useState('');
  const [purpose,     setPurpose]     = useState('');
  const [destination, setDest]        = useState('');
  const [startDate,   setStart]       = useState(new Date().toISOString().slice(0, 10));
  const [endDate,     setEnd]         = useState(new Date().toISOString().slice(0, 10));
  const [costCenter,  setCostCenter]  = useState('');
  const [notes,       setNotes]       = useState('');
  const [lines,       setLines]       = useState<LineForm[]>([emptyLine()]);
  const [error,       setError]       = useState('');

  // Load employees for picker
  const { data: empData } = useQuery({
    queryKey: ['employees', 'active'],
    queryFn:  () => employeesApi.list({ status: 'active' }),
  });
  const employees = empData?.data?.employees ?? [];

  const totalCents = lines.reduce((s, l) => {
    if (l.category === 'mileage') {
      const km = parseFloat(l.kmStr) || 0;
      return s + Math.round(km * KM_RATE_CENTS);
    }
    return s + Math.round(parseFloat(l.amountStr.replace(',', '.')) * 100 || 0);
  }, 0);

  const setLine = <K extends keyof LineForm>(i: number, k: K, v: LineForm[K]) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  function handleKmChange(i: number, kmStr: string) {
    const km     = parseFloat(kmStr) || 0;
    const amount = (km * KM_RATE_CENTS / 100).toFixed(2);
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, kmStr, amountStr: amount } : l));
  }

  function buildLines(): ExpenseLine[] {
    return lines.map(l => {
      const amountCents = l.category === 'mileage'
        ? Math.round((parseFloat(l.kmStr) || 0) * KM_RATE_CENTS)
        : Math.round(parseFloat(l.amountStr.replace(',', '.')) * 100 || 0);
      return {
        category:      l.category,
        description:   l.description,
        amountCents,
        vatRate:       l.vatRate,
        receiptNumber: l.receiptNumber,
        km:            l.category === 'mileage' ? parseFloat(l.kmStr) || 0 : undefined,
        kmRate:        l.category === 'mileage' ? KM_RATE_CENTS / 100 : undefined,
      };
    });
  }

  const mutation = useMutation({
    mutationFn: () => {
      const body: TravelExpenseCreate = {
        employeeId, purpose, destination, startDate, endDate,
        lines: buildLines(), costCenterNumber: costCenter,
        personnelAccount: '4120', expenseAccount: '6650', notes,
      };
      return travelExpensesApi.create(body);
    },
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['travel-expenses'] });
      navigate(`/erp/reisekosten/${res.data._id}`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  function validate() {
    if (!employeeId) { setError(de ? 'Mitarbeiter auswählen.' : 'Select an employee.'); return false; }
    if (!purpose.trim()) { setError(de ? 'Reisezweck angeben.' : 'Enter a purpose.'); return false; }
    if (lines.length === 0) { setError(de ? 'Mindestens eine Position erfassen.' : 'Add at least one line.'); return false; }
    return true;
  }

  const selectedEmp = employees.find(e => e._id === employeeId);

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="center" gap={2} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/reisekosten')} size="small">
          {de ? 'Reisekosten' : 'Travel Expenses'}
        </Button>
        <Typography variant="h5" fontWeight={700} flex={1}>
          {de ? 'Neue Reisekostenabrechnung' : 'New travel expense claim'}
        </Typography>
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
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Allgemeine Daten' : 'General'}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Autocomplete
                  size="small"
                  options={employees}
                  getOptionLabel={e => `${e.lastName}, ${e.firstName} (${e.employeeNumber})`}
                  value={employees.find(e => e._id === employeeId) ?? null}
                  onChange={(_, v) => setEmployeeId(v?._id ?? '')}
                  renderInput={params => <TextField {...params} label={`${de ? 'Mitarbeiter' : 'Employee'} *`} />}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={`${de ? 'Reisezweck' : 'Purpose'} *`} size="small" fullWidth
                  value={purpose} onChange={e => setPurpose(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={de ? 'Reiseziel' : 'Destination'} size="small" fullWidth
                  value={destination} onChange={e => setDest(e.target.value)} />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField label={de ? 'Von' : 'From'} type="date" size="small" fullWidth
                  value={startDate} onChange={e => setStart(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField label={de ? 'Bis' : 'To'} type="date" size="small" fullWidth
                  value={endDate} onChange={e => setEnd(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={de ? 'Kostenstelle' : 'Cost center'} size="small" fullWidth
                  value={costCenter} onChange={e => setCostCenter(e.target.value)}
                  placeholder={selectedEmp?.costCenterNumber || ''}
                  inputProps={{ style: { fontFamily: 'monospace' } }} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Typography variant="subtitle2" color="text.secondary">{de ? 'Kostenarten' : 'Expense items'}</Typography>
              <Chip label={`${de ? 'Gesamt' : 'Total'}: ${fmtCents(totalCents, locale)}`} color="primary" />
            </Stack>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ minWidth: 150 }}>{de ? 'Art' : 'Category'}</TableCell>
                    <TableCell>{de ? 'Beschreibung' : 'Description'}</TableCell>
                    <TableCell sx={{ width: 80 }}>{de ? 'Km' : 'Km'}</TableCell>
                    <TableCell sx={{ width: 120 }}>{de ? 'Betrag (€)' : 'Amount (€)'}</TableCell>
                    <TableCell sx={{ width: 80 }}>{de ? 'MwSt. %' : 'VAT %'}</TableCell>
                    <TableCell sx={{ width: 100 }}>{de ? 'Beleg-Nr.' : 'Receipt no.'}</TableCell>
                    <TableCell sx={{ width: 40 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((line, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <FormControl size="small" fullWidth>
                          <Select value={line.category} onChange={e => setLine(i, 'category', e.target.value as ExpenseCategory)}>
                            {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map(c => (
                              <MenuItem key={c} value={c}>{de ? CATEGORY_LABELS[c].de : CATEGORY_LABELS[c].en}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        <TextField size="small" fullWidth value={line.description}
                          onChange={e => setLine(i, 'description', e.target.value)} placeholder={de ? 'Optional' : 'Optional'} />
                      </TableCell>
                      <TableCell>
                        {line.category === 'mileage' ? (
                          <TextField size="small" type="number" sx={{ width: 70 }}
                            value={line.kmStr} onChange={e => handleKmChange(i, e.target.value)}
                            inputProps={{ min: 0, step: 1, style: { textAlign: 'right' } }} placeholder="0" />
                        ) : <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>—</Typography>}
                      </TableCell>
                      <TableCell>
                        <TextField size="small" type="number" sx={{ width: 110 }}
                          value={line.amountStr}
                          onChange={e => setLine(i, 'amountStr', e.target.value)}
                          disabled={line.category === 'mileage'}
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
                      <TableCell>
                        <TextField size="small" sx={{ width: 90 }} value={line.receiptNumber}
                          onChange={e => setLine(i, 'receiptNumber', e.target.value)} placeholder="R-001" />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" disabled={lines.length <= 1} onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1 }} onClick={() => setLines(ls => [...ls, emptyLine()])}>
              {de ? 'Position hinzufügen' : 'Add line'}
            </Button>
            {lines.some(l => l.category === 'mileage') && (
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                {de ? `Km-Pauschale: ${KM_RATE_CENTS / 100} €/km (§9 EStG)` : `Mileage rate: ${KM_RATE_CENTS / 100} €/km (§9 EStG)`}
              </Typography>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={1}>{de ? 'Notizen' : 'Notes'}</Typography>
            <TextField size="small" fullWidth multiline rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
