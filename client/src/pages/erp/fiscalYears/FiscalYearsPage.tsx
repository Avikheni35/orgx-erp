import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip, Stack, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControlLabel,
  Switch, Alert, CircularProgress, Collapse, Table, TableHead, TableRow,
  TableCell, TableBody, IconButton, Tooltip, List, ListItem, ListItemIcon, ListItemText,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import LockIcon from '@mui/icons-material/Lock';
import DeleteIcon from '@mui/icons-material/Delete';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { useTranslation } from 'react-i18next';
import { fiscalYearsApi, type FiscalYear, type Period, type FiscalYearStatus, type PeriodStatus } from '../../../api/fiscalYears';

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  open:   'success',
  closed: 'warning',
  locked: 'error',
};

function fmt(d: string, locale: string) {
  return new Date(d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function PeriodRow({ fyId, period }: { fyId: string; period: Period }) {
  const qc = useQueryClient();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';

  const STATUS_LABEL: Record<string, string> = {
    open:   t('fiscalYears.status.open'),
    closed: t('fiscalYears.status.closed'),
    locked: t('fiscalYears.status.locked'),
  };

  const { mutate: setStatus, isPending } = useMutation({
    mutationFn: (s: PeriodStatus) => fiscalYearsApi.setPeriodStatus(fyId, period._id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fiscal-year', fyId] }),
  });

  const next: Record<PeriodStatus, PeriodStatus | null> = {
    open:   'closed',
    closed: 'locked',
    locked: null,
  };
  const nextStatus = next[period.status];

  return (
    <TableRow>
      <TableCell sx={{ pl: 4, width: 48 }}>
        <Typography variant="caption" color="text.secondary" fontFamily="monospace">
          {String(period.number).padStart(2, '0')}
        </Typography>
      </TableCell>
      <TableCell><Typography variant="body2">{period.name}</Typography></TableCell>
      <TableCell>
        <Typography variant="caption" color="text.secondary" fontFamily="monospace">
          {fmt(period.startDate, locale)} – {fmt(period.endDate, locale)}
        </Typography>
      </TableCell>
      <TableCell>
        <Chip label={STATUS_LABEL[period.status]} color={STATUS_COLOR[period.status]} size="small" />
      </TableCell>
      <TableCell align="right">
        {nextStatus && (
          <Tooltip title={t('fiscalYears.setToStatus', { status: STATUS_LABEL[nextStatus] })}>
            <IconButton size="small" disabled={isPending} onClick={() => setStatus(nextStatus)}>
              {isPending ? <CircularProgress size={16} /> : <LockIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </TableCell>
    </TableRow>
  );
}

function FiscalYearCard({ fy }: { fy: FiscalYear }) {
  const [expanded, setExpanded] = useState(false);
  const [closeDlg, setCloseDlg] = useState(false);
  const [closeResult, setCloseResult] = useState<{ message: string; closingEntryNumber: string | null; netResult: number } | null>(null);
  const qc = useQueryClient();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';

  const STATUS_LABEL: Record<string, string> = {
    open:   t('fiscalYears.status.open'),
    closed: t('fiscalYears.status.closed'),
    locked: t('fiscalYears.status.locked'),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['fiscal-year', fy._id],
    queryFn: () => fiscalYearsApi.get(fy._id),
    enabled: expanded,
  });
  const periods: Period[] = data?.data?.periods ?? [];

  const { mutate: setFyStatus } = useMutation({
    mutationFn: (s: FiscalYearStatus) => fiscalYearsApi.setStatus(fy._id, s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fiscal-years'] });
      qc.invalidateQueries({ queryKey: ['fiscal-year', fy._id] });
    },
  });

  const { mutate: closeFY, isPending: closing, error: closeError } = useMutation({
    mutationFn: () => fiscalYearsApi.close(fy._id),
    onSuccess: (res) => {
      setCloseResult(res.data);
      qc.invalidateQueries({ queryKey: ['fiscal-years'] });
      qc.invalidateQueries({ queryKey: ['fiscal-year', fy._id] });
    },
  });

  const { mutate: deleteFY, isPending: deleting } = useMutation({
    mutationFn: () => fiscalYearsApi.delete(fy._id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fiscal-years'] }),
  });

  const closeErrMsg = (closeError as { response?: { data?: { message?: string } } })?.response?.data?.message;
  const fmt2 = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
    <Card sx={{ mb: 2 }}>
      <CardContent sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" gap={2}>
          <CalendarMonthIcon color="primary" />
          <Box flex={1}>
            <Typography variant="subtitle1" fontWeight={700}>{fy.name}</Typography>
            <Typography variant="caption" color="text.secondary" fontFamily="monospace">
              {fmt(fy.startDate, locale)} – {fmt(fy.endDate, locale)}
            </Typography>
          </Box>
          <Chip label={STATUS_LABEL[fy.status]} color={STATUS_COLOR[fy.status]} size="small" />

          {fy.status === 'open' && (
            <Tooltip title={t('fiscalYears.closeDialog.title')}>
              <Button size="small" variant="outlined" color="warning" startIcon={<DoneAllIcon />} onClick={() => { setCloseResult(null); setCloseDlg(true); }}>
                {t('fiscalYears.closeFY')}
              </Button>
            </Tooltip>
          )}
          {fy.status === 'closed' && (
            <Tooltip title={t('fiscalYears.lockFY')}>
              <Button size="small" variant="outlined" color="error" startIcon={<LockIcon />} onClick={() => setFyStatus('locked')}>
                {t('fiscalYears.lockFY')}
              </Button>
            </Tooltip>
          )}
          {fy.status === 'open' && (
            <Tooltip title={t('fiscalYears.deleteFY')}>
              <IconButton size="small" color="error" onClick={() => { if (confirm(t('fiscalYears.deleteConfirm', { name: fy.name }))) deleteFY(); }} disabled={deleting}>
                {deleting ? <CircularProgress size={16} /> : <DeleteIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          <IconButton size="small" onClick={() => setExpanded((p) => !p)}>
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Stack>
      </CardContent>

      <Collapse in={expanded}>
        <Divider />
        {isLoading ? (
          <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>
        ) : periods.length === 0 ? (
          <Box sx={{ py: 2, px: 3 }}>
            <Typography variant="body2" color="text.secondary">{t('fiscalYears.noPeriods')}</Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ pl: 4, width: 48 }}>#</TableCell>
                <TableCell>{t('fiscalYears.period')}</TableCell>
                <TableCell>{t('fiscalYears.periodRange')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell align="right">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {periods.map((p) => (
                <PeriodRow key={p._id} fyId={fy._id} period={p} />
              ))}
            </TableBody>
          </Table>
        )}
      </Collapse>
    </Card>

    {/* Fiscal Year Closing Dialog */}
    <Dialog open={closeDlg} onClose={() => { if (!closing) setCloseDlg(false); }} maxWidth="sm" fullWidth>
      <DialogTitle>{t('fiscalYears.closeDialog.title')} — {fy.name}</DialogTitle>
      <DialogContent>
        {closeResult ? (
          <Stack gap={2} pt={1}>
            <Alert severity="success" icon={<CheckCircleOutlineIcon />}>
              {t('fiscalYears.closeDialog.success')}
            </Alert>
            {closeResult.closingEntryNumber && (
              <Typography variant="body2">
                {t('fiscalYears.closeDialog.successEntry', { entry: closeResult.closingEntryNumber })}
              </Typography>
            )}
            <Typography variant="body2">
              {t('fiscalYears.closeDialog.netResult', { amount: fmt2(closeResult.netResult) })}
            </Typography>
          </Stack>
        ) : (
          <Stack gap={2} pt={1}>
            {closeErrMsg && <Alert severity="error">{closeErrMsg}</Alert>}
            <Alert severity="warning">
              {t('fiscalYears.closeDialog.info4')}
            </Alert>
            <List dense disablePadding>
              {([
                t('fiscalYears.closeDialog.info1'),
                t('fiscalYears.closeDialog.info2'),
                t('fiscalYears.closeDialog.info3'),
              ] as string[]).map((info) => (
                <ListItem key={info} disableGutters>
                  <ListItemIcon sx={{ minWidth: 32 }}><CheckCircleOutlineIcon fontSize="small" color="action" /></ListItemIcon>
                  <ListItemText primary={<Typography variant="body2">{info}</Typography>} />
                </ListItem>
              ))}
            </List>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setCloseDlg(false)} disabled={closing}>{t('common.cancel')}</Button>
        {!closeResult && (
          <Button variant="contained" color="warning" onClick={() => closeFY()} disabled={closing}>
            {closing ? <CircularProgress size={18} color="inherit" /> : t('fiscalYears.closeDialog.confirm')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
    </>
  );
}

export default function FiscalYearsPage() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [createDlg, setCreateDlg] = useState(false);
  const [form, setForm] = useState({
    name:            '',
    startDate:       '',
    endDate:         '',
    generatePeriods: true,
  });
  const [formErr, setFormErr] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn:  () => fiscalYearsApi.list(),
  });
  const years: FiscalYear[] = data?.data?.fiscalYears ?? [];

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: () => fiscalYearsApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fiscal-years'] });
      setCreateDlg(false);
      setForm({ name: '', startDate: '', endDate: '', generatePeriods: true });
      setFormErr('');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setFormErr(msg ?? t('common.error'));
    },
  });

  const handleCreate = () => {
    if (!form.name || !form.startDate || !form.endDate) { setFormErr(t('fiscalYears.createDialog.allRequired')); return; }
    setFormErr('');
    create();
  };

  const suggestYear = () => {
    const usedYears = new Set(years.map((y) => new Date(y.startDate).getFullYear()));
    let yr = new Date().getFullYear();
    while (usedYears.has(yr)) yr++;
    setForm((p) => ({
      ...p,
      name:      `Geschäftsjahr ${yr}`,
      startDate: `${yr}-01-01`,
      endDate:   `${yr}-12-31`,
    }));
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('fiscalYears.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('fiscalYears.subtitle')}</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { suggestYear(); setCreateDlg(true); }}>
          {t('fiscalYears.createFY')}
        </Button>
      </Stack>

      {isLoading && <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>}

      {!isLoading && years.length === 0 && (
        <Card>
          <Box sx={{ py: 10, textAlign: 'center' }}>
            <CalendarMonthIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
            <Typography color="text.secondary" mb={2}>{t('fiscalYears.noFY')}</Typography>
            <Button variant="contained" onClick={() => { suggestYear(); setCreateDlg(true); }}>
              {t('fiscalYears.createFirst')}
            </Button>
          </Box>
        </Card>
      )}

      {years.map((fy) => <FiscalYearCard key={fy._id} fy={fy} />)}

      {years.length > 0 && (
        <Box mt={3}>
          <Typography variant="caption" color="text.secondary">{t('fiscalYears.statusNote')}</Typography>
        </Box>
      )}

      {/* Create Dialog */}
      <Dialog open={createDlg} onClose={() => setCreateDlg(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('fiscalYears.createDialog.title')}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {formErr && (
              <Grid item xs={12}>
                <Alert severity="error">{formErr}</Alert>
              </Grid>
            )}
            <Grid item xs={12}>
              <TextField
                label={`${t('fiscalYears.createDialog.label')} *`}
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                fullWidth size="small"
                placeholder="z.B. Geschäftsjahr 2025"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label={`${t('fiscalYears.createDialog.startDate')} *`}
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                fullWidth size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label={`${t('fiscalYears.createDialog.endDate')} *`}
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                fullWidth size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.generatePeriods}
                    onChange={(e) => setForm((p) => ({ ...p, generatePeriods: e.target.checked }))}
                  />
                }
                label={t('fiscalYears.createDialog.generatePeriods')}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDlg(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleCreate} disabled={creating}>
            {creating ? <CircularProgress size={18} color="inherit" /> : t('fiscalYears.createDialog.create')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
