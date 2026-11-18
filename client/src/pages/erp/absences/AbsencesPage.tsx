import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Tabs, Tab, Table, TableHead, TableBody, TableRow,
  TableCell, CircularProgress, Alert, Chip, Select, MenuItem, FormControl, InputLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid, Autocomplete,
  Card, CardContent,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import { absencesApi, type AbsenceStatus, type AbsenceType } from '../../../api/absences';
import { employeesApi } from '../../../api/employees';

const STATUS_COLOR: Record<AbsenceStatus, 'warning' | 'success' | 'error' | 'default'> = {
  requested: 'warning',
  approved:  'success',
  rejected:  'error',
  cancelled: 'default',
};

const TYPE_COLOR: Record<AbsenceType, 'primary' | 'error' | 'secondary' | 'warning' | 'default'> = {
  vacation: 'primary',
  sick:     'error',
  parental: 'secondary',
  unpaid:   'warning',
  other:    'default',
};

const today = new Date().toISOString().slice(0, 10);

export default function AbsencesPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const qc       = useQueryClient();

  const [tab,        setTab]    = useState(0);
  const [statusFilt, setStatus] = useState('');
  const [typeFilt,   setType]   = useState('');
  const [yearFilt,   setYear]   = useState(String(new Date().getFullYear()));

  const [createOpen, setCreate] = useState(false);
  const [empId,      setEmpId]  = useState('');
  const [absType,    setAbsType]= useState('vacation');
  const [startDate,  setStart]  = useState(today);
  const [endDate,    setEnd]    = useState(today);
  const [days,       setDays]   = useState('1');
  const [reason,     setReason] = useState('');
  const [notes,      setNotes]  = useState('');
  const [createErr,  setCreateErr] = useState('');

  const STATUS_LABEL: Record<AbsenceStatus, string> = {
    requested: de ? 'Beantragt'  : 'Requested',
    approved:  de ? 'Genehmigt'  : 'Approved',
    rejected:  de ? 'Abgelehnt'  : 'Rejected',
    cancelled: de ? 'Storniert'  : 'Cancelled',
  };

  const TYPE_LABEL: Record<AbsenceType, string> = {
    vacation: de ? 'Urlaub'         : 'Vacation',
    sick:     de ? 'Krankmeldung'   : 'Sick leave',
    parental: de ? 'Elternzeit'     : 'Parental leave',
    unpaid:   de ? 'Unbezahlt'      : 'Unpaid leave',
    other:    de ? 'Sonstige'       : 'Other',
  };

  const { data: absData, isLoading, isError } = useQuery({
    queryKey: ['absences', statusFilt, typeFilt],
    queryFn:  () => absencesApi.list({ status: statusFilt || undefined, type: typeFilt || undefined }),
    enabled:  tab === 0,
  });

  const { data: summaryData, isLoading: sumLoad } = useQuery({
    queryKey: ['absences-summary', yearFilt],
    queryFn:  () => absencesApi.summary(yearFilt ? parseInt(yearFilt, 10) : undefined),
    enabled:  tab === 1,
  });

  const { data: empData } = useQuery({
    queryKey: ['employees-active'],
    queryFn:  () => employeesApi.list({ status: 'active' }),
  });
  const employees = empData?.data?.employees ?? [];

  const absences = absData?.data?.absences ?? [];
  const summary  = summaryData?.data?.summary ?? [];

  function onErr(e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    setCreateErr(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
  }

  const createMut  = useMutation({
    mutationFn: () => absencesApi.create({
      employeeId: empId, type: absType, startDate, endDate,
      days: parseFloat(days) || 1, reason, notes,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['absences'] }); setCreate(false); setCreateErr(''); },
    onError: onErr,
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => absencesApi.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['absences'] }),
  });

  const rejectMut  = useMutation({
    mutationFn: (id: string) => absencesApi.reject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['absences'] }),
  });

  function calcDays(s: string, e: string) {
    const diff = (new Date(e).getTime() - new Date(s).getTime()) / 86400000;
    return Math.max(1, Math.round(diff) + 1);
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Abwesenheiten' : 'Absences'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Urlaub, Krankheit, Elternzeit und sonstige Abwesenheiten' : 'Vacation, sick leave, parental leave, and other absences'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setCreate(true); setCreateErr(''); }}>
          {de ? 'Abwesenheit erfassen' : 'Record absence'}
        </Button>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={de ? 'Anträge' : 'Requests'} />
        <Tab label={de ? 'Jahresübersicht' : 'Annual summary'} />
      </Tabs>

      {/* ── Requests tab ── */}
      {tab === 0 && (
        <>
          <Stack direction="row" gap={2} mb={2} flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Status</InputLabel>
              <Select value={statusFilt} label="Status" onChange={e => setStatus(e.target.value)}>
                <MenuItem value="">{de ? 'Alle' : 'All'}</MenuItem>
                {(Object.keys(STATUS_LABEL) as AbsenceStatus[]).map(s => (
                  <MenuItem key={s} value={s}>{STATUS_LABEL[s]}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{de ? 'Art' : 'Type'}</InputLabel>
              <Select value={typeFilt} label={de ? 'Art' : 'Type'} onChange={e => setType(e.target.value)}>
                <MenuItem value="">{de ? 'Alle' : 'All'}</MenuItem>
                {(Object.keys(TYPE_LABEL) as AbsenceType[]).map(t => (
                  <MenuItem key={t} value={t}>{TYPE_LABEL[t]}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          {isLoading && <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>}
          {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}
          {!isLoading && !isError && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{de ? 'Mitarbeiter' : 'Employee'}</TableCell>
                    <TableCell>{de ? 'Art' : 'Type'}</TableCell>
                    <TableCell>{de ? 'Von' : 'From'}</TableCell>
                    <TableCell>{de ? 'Bis' : 'To'}</TableCell>
                    <TableCell align="right">{de ? 'Tage' : 'Days'}</TableCell>
                    <TableCell>{de ? 'Grund' : 'Reason'}</TableCell>
                    <TableCell>{de ? 'Status' : 'Status'}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {absences.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                        {de ? 'Keine Abwesenheiten gefunden.' : 'No absences found.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {absences.map(a => (
                    <TableRow key={a._id} hover>
                      <TableCell><Typography variant="body2" fontWeight={500}>{a.employeeName}</Typography></TableCell>
                      <TableCell>
                        <Chip size="small" label={TYPE_LABEL[a.type]} color={TYPE_COLOR[a.type]} variant="outlined" />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(a.startDate).toLocaleDateString(locale)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(a.endDate).toLocaleDateString(locale)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{a.days}</TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.reason || '—'}
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={STATUS_LABEL[a.status]} color={STATUS_COLOR[a.status]} />
                      </TableCell>
                      <TableCell>
                        {a.status === 'requested' && (
                          <Stack direction="row" gap={0.5}>
                            <Button size="small" color="success" startIcon={<CheckIcon />}
                              disabled={approveMut.isPending}
                              onClick={() => approveMut.mutate(a._id)}>
                              {de ? 'Genehmigen' : 'Approve'}
                            </Button>
                            <Button size="small" color="error" startIcon={<CloseIcon />}
                              disabled={rejectMut.isPending}
                              onClick={() => rejectMut.mutate(a._id)}>
                              {de ? 'Ablehnen' : 'Reject'}
                            </Button>
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </>
      )}

      {/* ── Annual summary tab ── */}
      {tab === 1 && (
        <>
          <Stack direction="row" gap={2} mb={2}>
            <TextField label={de ? 'Jahr' : 'Year'} size="small" sx={{ width: 100 }}
              type="number" value={yearFilt} onChange={e => setYear(e.target.value)} />
          </Stack>
          {sumLoad && <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>}
          {!sumLoad && (
            <Stack gap={2}>
              {summary.length === 0 && (
                <Alert severity="info">{de ? 'Keine genehmigten Abwesenheiten in diesem Jahr.' : 'No approved absences in this year.'}</Alert>
              )}
              {summary.map(s => (
                <Card key={s._id} variant="outlined">
                  <CardContent sx={{ py: '12px !important' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle2" fontWeight={600}>{s.employeeName}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {s.totalDays} {de ? 'Tage gesamt' : 'days total'}
                      </Typography>
                    </Stack>
                    <Stack direction="row" gap={1} mt={0.5} flexWrap="wrap">
                      {s.breakdown.map(b => (
                        <Chip key={b.type} size="small"
                          label={`${TYPE_LABEL[b.type as AbsenceType] ?? b.type}: ${b.days}d`}
                          color={TYPE_COLOR[b.type as AbsenceType] ?? 'default'} variant="outlined" />
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreate(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{de ? 'Abwesenheit erfassen' : 'Record absence'}</DialogTitle>
        <DialogContent>
          {createErr && <Alert severity="error" sx={{ mb: 2 }}>{createErr}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <Autocomplete size="small" options={employees}
                getOptionLabel={e => `${e.firstName} ${e.lastName}`}
                value={employees.find(e => e._id === empId) ?? null}
                onChange={(_, v) => setEmpId(v?._id ?? '')}
                renderInput={p => <TextField {...p} label={`${de ? 'Mitarbeiter' : 'Employee'} *`} />} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl size="small" fullWidth>
                <InputLabel>{de ? 'Art' : 'Type'}</InputLabel>
                <Select value={absType} label={de ? 'Art' : 'Type'} onChange={e => setAbsType(e.target.value)}>
                  {(Object.keys(TYPE_LABEL) as AbsenceType[]).map(t => (
                    <MenuItem key={t} value={t}>{TYPE_LABEL[t]}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label={`${de ? 'Von' : 'From'} *`} type="date" size="small" fullWidth
                value={startDate} InputLabelProps={{ shrink: true }}
                onChange={e => {
                  setStart(e.target.value);
                  setDays(String(calcDays(e.target.value, endDate)));
                }} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label={`${de ? 'Bis' : 'To'} *`} type="date" size="small" fullWidth
                value={endDate} InputLabelProps={{ shrink: true }}
                onChange={e => {
                  setEnd(e.target.value);
                  setDays(String(calcDays(startDate, e.target.value)));
                }} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label={de ? 'Tage' : 'Days'} size="small" fullWidth type="number"
                value={days} onChange={e => setDays(e.target.value)}
                inputProps={{ min: 0.5, step: 0.5 }} />
            </Grid>
            <Grid item xs={12}>
              <TextField label={de ? 'Grund' : 'Reason'} size="small" fullWidth
                value={reason} onChange={e => setReason(e.target.value)} />
            </Grid>
            <Grid item xs={12}>
              <TextField label={de ? 'Notizen' : 'Notes'} size="small" fullWidth multiline rows={2}
                value={notes} onChange={e => setNotes(e.target.value)} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreate(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
            {de ? 'Speichern' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
