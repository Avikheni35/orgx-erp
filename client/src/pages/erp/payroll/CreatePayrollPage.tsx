import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Select, MenuItem,
  FormControl, InputLabel, Alert, CircularProgress, Checkbox, Table,
  TableHead, TableBody, TableRow, TableCell, Chip, Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTranslation } from 'react-i18next';
import { payrollApi } from '../../../api/payroll';
import { employeesApi } from '../../../api/employees';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function CreatePayrollPage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const now = new Date();
  const [year,    setYear]    = useState(now.getFullYear());
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allSelected, setAllSelected] = useState(true);
  const [error,   setError]   = useState('');

  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ['employees', 'active'],
    queryFn:  () => employeesApi.list({ status: 'active' }),
  });
  const employees = empData?.data?.employees ?? [];

  useEffect(() => {
    if (employees.length > 0 && selected.size === 0) {
      setSelected(new Set(employees.map(e => e._id)));
      setAllSelected(true);
    }
  }, [employees]);

  function toggleAll(checked: boolean) {
    setAllSelected(checked);
    setSelected(checked ? new Set(employees.map(e => e._id)) : new Set());
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      setAllSelected(next.size === employees.length);
      return next;
    });
  }

  const mutation = useMutation({
    mutationFn: () => payrollApi.create({
      year, month,
      employeeIds: allSelected ? undefined : Array.from(selected),
    }),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['payrolls'] });
      navigate(`/erp/lohn/${res.data._id}`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  const periodLabel = new Date(year, month - 1, 1).toLocaleString(locale, { month: 'long', year: 'numeric' });

  return (
    <Box maxWidth={800}>
      <Stack direction="row" alignItems="center" gap={2} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/lohn')} size="small">
          {de ? 'Lohnabrechnung' : 'Payroll'}
        </Button>
        <Typography variant="h5" fontWeight={700} flex={1}>
          {de ? 'Neue Lohnabrechnung erstellen' : 'Create payroll run'}
        </Typography>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack gap={3}>
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Abrechnungsmonat' : 'Payroll period'}</Typography>
            <Stack direction="row" gap={2}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>{de ? 'Jahr' : 'Year'}</InputLabel>
                <Select value={year} label={de ? 'Jahr' : 'Year'} onChange={e => setYear(Number(e.target.value))}>
                  {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                    <MenuItem key={y} value={y}>{y}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>{de ? 'Monat' : 'Month'}</InputLabel>
                <Select value={month} label={de ? 'Monat' : 'Month'} onChange={e => setMonth(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <MenuItem key={m} value={m}>
                      {new Date(2000, m - 1, 1).toLocaleString(locale, { month: 'long' })}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            <Chip sx={{ mt: 1.5 }} label={periodLabel} color="primary" size="small" />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Typography variant="subtitle2" color="text.secondary">
                {de ? `Mitarbeiter (${selected.size} ausgewählt)` : `Employees (${selected.size} selected)`}
              </Typography>
              {empLoading && <CircularProgress size={18} />}
            </Stack>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox checked={allSelected} indeterminate={selected.size > 0 && !allSelected}
                        onChange={e => toggleAll(e.target.checked)} />
                    </TableCell>
                    <TableCell>{de ? 'Name' : 'Name'}</TableCell>
                    <TableCell>{de ? 'Abteilung' : 'Department'}</TableCell>
                    <TableCell>{de ? 'Lohnart' : 'Type'}</TableCell>
                    <TableCell align="right">{de ? 'Grundgehalt/-lohn' : 'Base salary'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {employees.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ color: 'text.disabled' }}>
                        {de ? 'Keine aktiven Mitarbeiter.' : 'No active employees.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {employees.map(emp => (
                    <TableRow key={emp._id} hover sx={{ cursor: 'pointer' }} onClick={() => toggle(emp._id)}>
                      <TableCell padding="checkbox">
                        <Checkbox checked={selected.has(emp._id)} onChange={() => toggle(emp._id)} onClick={e => e.stopPropagation()} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{emp.lastName}, {emp.firstName}</Typography>
                        <Typography variant="caption" color="text.secondary" fontFamily="monospace">{emp.employeeNumber}</Typography>
                      </TableCell>
                      <TableCell>{emp.department || '—'}</TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {emp.salaryType === 'monthly' ? (de ? 'Gehalt' : 'Salary') : (de ? 'Stundenlohn' : 'Hourly')}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {emp.salaryCents > 0
                          ? fmtCents(emp.salaryCents, locale) + (emp.salaryType === 'monthly' ? (de ? '/Monat' : '/mo') : (de ? '/Std.' : '/hr'))
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>

        <Divider />
        <Stack direction="row" justifyContent="flex-end">
          <Button variant="contained" size="large" sx={{ minWidth: 260 }}
            disabled={selected.size === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}>
            {mutation.isPending
              ? <CircularProgress size={22} color="inherit" />
              : (de ? `Lohnabrechnung für ${periodLabel} erstellen` : `Create payroll for ${periodLabel}`)}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
