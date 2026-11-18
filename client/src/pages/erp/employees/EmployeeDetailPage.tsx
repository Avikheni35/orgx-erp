import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, CircularProgress,
  Alert, Divider, Grid, Avatar, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Select, MenuItem, FormControl, InputLabel,
  Table, TableHead, TableBody, TableRow, TableCell,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import { useTranslation } from 'react-i18next';
import { employeesApi, type EmployeeStatus, type SalaryType, type TaxClass } from '../../../api/employees';
import apiClient from '../../../api/client';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

const STATUS_COLOR: Record<EmployeeStatus, 'success' | 'default' | 'error'> = {
  active: 'success', inactive: 'default', terminated: 'error',
};

export default function EmployeeDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [editOpen,    setEditOpen]    = useState(false);
  const [editFields,  setEditFields]  = useState<Record<string, string>>({});
  const [editSalary,  setEditSalary]  = useState('');
  const [editStatus,  setEditStatus]  = useState<EmployeeStatus>('active');
  const [editError,   setEditError]   = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['employee', id],
    queryFn:  () => employeesApi.get(id!),
    enabled:  !!id,
  });

  interface PayrollRow {
    _id: string; payrollNumber: string; period: string; year: number; month: number;
    status: string; postedAt?: string;
    entry: { grossCents: number; taxCents: number; socialSecurityCents: number; netCents: number; };
  }
  const { data: histData } = useQuery({
    queryKey: ['employee-payroll', id],
    queryFn:  () => apiClient.get<{ rows: PayrollRow[] }>(`/payroll/employee/${id}`),
    enabled:  !!id,
  });
  const payrollRows = histData?.data?.rows ?? [];

  const emp = data?.data;

  const updateMutation = useMutation({
    mutationFn: () => employeesApi.update(id!, {
      ...editFields,
      status:      editStatus,
      salaryType:  (editFields.salaryType as SalaryType) || emp?.salaryType,
      taxClass:    (editFields.taxClass   as TaxClass)   || emp?.taxClass,
      salaryCents: Math.round(parseFloat(editSalary.replace(',', '.') || '0') * 100),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee', id] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      setEditOpen(false);
      setEditError('');
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setEditError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  function openEdit() {
    if (!emp) return;
    setEditFields({
      firstName: emp.firstName, lastName: emp.lastName, email: emp.email, phone: emp.phone,
      address: emp.address, department: emp.department, position: emp.position,
      salaryType: emp.salaryType, taxClass: emp.taxClass,
      healthInsurance: emp.healthInsurance, personnelAccount: emp.personnelAccount,
      costCenterNumber: emp.costCenterNumber, notes: emp.notes,
    });
    setEditSalary(String((emp.salaryCents / 100).toFixed(2)));
    setEditStatus(emp.status);
    setEditError('');
    setEditOpen(true);
  }

  const ef = (k: string, v: string) => setEditFields(f => ({ ...f, [k]: v }));

  if (isLoading) return <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>;
  if (isError || !emp) return <Alert severity="error">{de ? 'Mitarbeiter nicht gefunden.' : 'Employee not found.'}</Alert>;

  const statusLabel = emp.status === 'active' ? (de ? 'Aktiv' : 'Active') : emp.status === 'inactive' ? (de ? 'Inaktiv' : 'Inactive') : (de ? 'Ausgeschieden' : 'Terminated');

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/mitarbeiter')}>
          {de ? 'Mitarbeiter' : 'Employees'}
        </Button>
      </Stack>

      <Stack gap={3}>
        {/* Header */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Stack direction="row" gap={2} alignItems="center">
                <Avatar sx={{ width: 56, height: 56, fontSize: 22, bgcolor: 'primary.main' }}>
                  {initials(emp.firstName, emp.lastName)}
                </Avatar>
                <Box>
                  <Stack direction="row" gap={1} alignItems="center">
                    <Typography variant="h5" fontWeight={700}>{emp.firstName} {emp.lastName}</Typography>
                    <Chip size="small" label={statusLabel} color={STATUS_COLOR[emp.status]} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {[emp.position, emp.department].filter(Boolean).join(' · ')}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" fontFamily="monospace">{emp.employeeNumber}</Typography>
                </Box>
              </Stack>
              <Button size="small" startIcon={<EditIcon />} onClick={openEdit}>{de ? 'Bearbeiten' : 'Edit'}</Button>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              {[
                { label: de ? 'E-Mail'              : 'Email',         value: emp.email      || '—' },
                { label: de ? 'Telefon'             : 'Phone',         value: emp.phone      || '—' },
                { label: de ? 'Eintrittsdatum'      : 'Start date',    value: new Date(emp.startDate).toLocaleDateString(locale) },
                { label: de ? 'Austrittsdatum'      : 'End date',      value: emp.endDate ? new Date(emp.endDate).toLocaleDateString(locale) : '—' },
                { label: de ? 'Geburtsdatum'        : 'Date of birth', value: emp.dateOfBirth ? new Date(emp.dateOfBirth).toLocaleDateString(locale) : '—' },
              ].map(item => (
                <Grid item xs={6} sm={4} key={item.label}>
                  <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                  <Typography variant="body2">{item.value}</Typography>
                </Grid>
              ))}
              {emp.address && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">{de ? 'Adresse' : 'Address'}</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{emp.address}</Typography>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>

        {/* Payroll card */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Lohn- und Gehaltsdaten' : 'Payroll data'}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">{de ? 'Lohnart' : 'Salary type'}</Typography>
                <Typography variant="body2" fontWeight={500}>{emp.salaryType === 'monthly' ? (de ? 'Monatsgehalt' : 'Monthly') : (de ? 'Stundenlohn' : 'Hourly')}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">{emp.salaryType === 'monthly' ? (de ? 'Bruttogehalt / Monat' : 'Gross / month') : (de ? 'Stundensatz' : 'Hourly rate')}</Typography>
                <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{emp.salaryCents > 0 ? fmtCents(emp.salaryCents, locale) : '—'}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">{de ? 'Steuerklasse' : 'Tax class'}</Typography>
                <Typography variant="body2">{emp.taxClass}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">{de ? 'Krankenkasse' : 'Health insurance'}</Typography>
                <Typography variant="body2">{emp.healthInsurance || '—'}</Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Accounting card */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Buchhaltungsverknüpfung' : 'Accounting'}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">{de ? 'Personalkonto' : 'Personnel account'}</Typography>
                <Typography variant="body2" fontFamily="monospace">{emp.personnelAccount}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">{de ? 'Kostenstelle' : 'Cost center'}</Typography>
                <Typography variant="body2" fontFamily="monospace">{emp.costCenterNumber || '—'}</Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Payroll history ledger */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Lohnhistorie' : 'Payroll History'}</Typography>
            {payrollRows.length === 0 ? (
              <Typography variant="body2" color="text.disabled">{de ? 'Keine Abrechnungen vorhanden.' : 'No payroll runs found.'}</Typography>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{de ? 'Periode' : 'Period'}</TableCell>
                      <TableCell>{de ? 'Brutto' : 'Gross'}</TableCell>
                      <TableCell>{de ? 'LSt' : 'Tax'}</TableCell>
                      <TableCell>{de ? 'SV' : 'SV'}</TableCell>
                      <TableCell>{de ? 'Netto' : 'Net'}</TableCell>
                      <TableCell>{de ? 'Status' : 'Status'}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payrollRows.map(r => (
                      <TableRow key={r._id} hover onClick={() => navigate(`/erp/lohn/${r._id}`)} sx={{ cursor: 'pointer' }}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {new Date(r.year, r.month - 1, 1).toLocaleString(locale, { month: 'long', year: 'numeric' })}
                          </Typography>
                          <Typography variant="caption" color="text.disabled" fontFamily="monospace">{r.payrollNumber}</Typography>
                        </TableCell>
                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(r.entry?.grossCents ?? 0, locale)}</TableCell>
                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums', color: 'error.main' }}>−{fmtCents(r.entry?.taxCents ?? 0, locale)}</TableCell>
                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums', color: 'error.main' }}>−{fmtCents(r.entry?.socialSecurityCents ?? 0, locale)}</TableCell>
                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtCents(r.entry?.netCents ?? 0, locale)}</TableCell>
                        <TableCell>
                          <Chip size="small" label={r.status} color={r.status === 'posted' ? 'success' : r.status === 'finalized' ? 'info' : 'default'} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </CardContent>
        </Card>

        {emp.notes && (
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={1}>{de ? 'Notizen' : 'Notes'}</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{emp.notes}</Typography>
            </CardContent>
          </Card>
        )}
      </Stack>

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{de ? 'Mitarbeiter bearbeiten' : 'Edit employee'}</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            <Grid container spacing={2}>
              <Grid item xs={6}><TextField label={de ? 'Vorname' : 'First name'} size="small" fullWidth value={editFields.firstName ?? ''} onChange={e => ef('firstName', e.target.value)} /></Grid>
              <Grid item xs={6}><TextField label={de ? 'Nachname' : 'Last name'} size="small" fullWidth value={editFields.lastName ?? ''} onChange={e => ef('lastName', e.target.value)} /></Grid>
              <Grid item xs={6}><TextField label={de ? 'E-Mail' : 'Email'} size="small" fullWidth value={editFields.email ?? ''} onChange={e => ef('email', e.target.value)} /></Grid>
              <Grid item xs={6}><TextField label={de ? 'Telefon' : 'Phone'} size="small" fullWidth value={editFields.phone ?? ''} onChange={e => ef('phone', e.target.value)} /></Grid>
              <Grid item xs={6}><TextField label={de ? 'Abteilung' : 'Department'} size="small" fullWidth value={editFields.department ?? ''} onChange={e => ef('department', e.target.value)} /></Grid>
              <Grid item xs={6}><TextField label={de ? 'Position' : 'Position'} size="small" fullWidth value={editFields.position ?? ''} onChange={e => ef('position', e.target.value)} /></Grid>
              <Grid item xs={6}>
                <FormControl size="small" fullWidth>
                  <InputLabel>{de ? 'Status' : 'Status'}</InputLabel>
                  <Select value={editStatus} label="Status" onChange={e => setEditStatus(e.target.value as EmployeeStatus)}>
                    <MenuItem value="active">{de ? 'Aktiv' : 'Active'}</MenuItem>
                    <MenuItem value="inactive">{de ? 'Inaktiv' : 'Inactive'}</MenuItem>
                    <MenuItem value="terminated">{de ? 'Ausgeschieden' : 'Terminated'}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl size="small" fullWidth>
                  <InputLabel>{de ? 'Lohnart' : 'Type'}</InputLabel>
                  <Select value={editFields.salaryType ?? 'monthly'} label={de ? 'Lohnart' : 'Type'} onChange={e => ef('salaryType', e.target.value)}>
                    <MenuItem value="monthly">{de ? 'Monatsgehalt' : 'Monthly'}</MenuItem>
                    <MenuItem value="hourly">{de ? 'Stundenlohn' : 'Hourly'}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}><TextField label={de ? 'Brutto (€)' : 'Gross (€)'} size="small" fullWidth value={editSalary} onChange={e => setEditSalary(e.target.value)} /></Grid>
              <Grid item xs={6}>
                <FormControl size="small" fullWidth>
                  <InputLabel>{de ? 'Steuerklasse' : 'Tax class'}</InputLabel>
                  <Select value={editFields.taxClass ?? '1'} label={de ? 'Steuerklasse' : 'Tax class'} onChange={e => ef('taxClass', e.target.value)}>
                    {['1','2','3','4','5','6'].map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}><TextField label={de ? 'Krankenkasse' : 'Health insurance'} size="small" fullWidth value={editFields.healthInsurance ?? ''} onChange={e => ef('healthInsurance', e.target.value)} /></Grid>
              <Grid item xs={6}><TextField label={de ? 'Personalkonto' : 'Personnel account'} size="small" fullWidth value={editFields.personnelAccount ?? ''} onChange={e => ef('personnelAccount', e.target.value)} inputProps={{ style: { fontFamily: 'monospace' } }} /></Grid>
              <Grid item xs={6}><TextField label={de ? 'Kostenstelle' : 'Cost center'} size="small" fullWidth value={editFields.costCenterNumber ?? ''} onChange={e => ef('costCenterNumber', e.target.value)} inputProps={{ style: { fontFamily: 'monospace' } }} /></Grid>
              <Grid item xs={12}><TextField label={de ? 'Notizen' : 'Notes'} size="small" fullWidth multiline rows={2} value={editFields.notes ?? ''} onChange={e => ef('notes', e.target.value)} /></Grid>
            </Grid>
            {editError && <Alert severity="error">{editError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
            {updateMutation.isPending ? <CircularProgress size={20} /> : (de ? 'Speichern' : 'Save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
