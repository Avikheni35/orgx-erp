import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, Button, Table, TableHead, TableBody, TableRow,
  TableCell, CircularProgress, Alert, Chip, TextField, Select, MenuItem,
  FormControl, InputLabel, Avatar, InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslation } from 'react-i18next';
import { employeesApi, type EmployeeStatus } from '../../../api/employees';

const STATUS_COLOR: Record<EmployeeStatus, 'success' | 'default' | 'error'> = {
  active:     'success',
  inactive:   'default',
  terminated: 'error',
};

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function EmployeeListPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const navigate = useNavigate();

  const [search,     setSearch]     = useState('');
  const [statusFilter, setStatus]   = useState('active');
  const [deptFilter,   setDept]     = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['employees', statusFilter, deptFilter, search],
    queryFn:  () => employeesApi.list({
      status:     statusFilter || undefined,
      department: deptFilter   || undefined,
      q:          search       || undefined,
    }),
  });

  const employees   = data?.data?.employees   ?? [];
  const departments = data?.data?.departments ?? [];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Mitarbeiter' : 'Employees'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Personalstammdaten für Lohn- und Gehaltsabrechnung' : 'Employee master data for payroll'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/mitarbeiter/new')}>
          {de ? 'Neuer Mitarbeiter' : 'New employee'}
        </Button>
      </Stack>

      {/* Filters */}
      <Stack direction="row" gap={2} mb={2} flexWrap="wrap">
        <TextField
          size="small" placeholder={de ? 'Suche Name, E-Mail…' : 'Search name, email…'}
          value={search} onChange={e => setSearch(e.target.value)}
          sx={{ minWidth: 220 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{de ? 'Status' : 'Status'}</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatus(e.target.value)}>
            <MenuItem value="">{de ? 'Alle' : 'All'}</MenuItem>
            <MenuItem value="active">{de ? 'Aktiv' : 'Active'}</MenuItem>
            <MenuItem value="inactive">{de ? 'Inaktiv' : 'Inactive'}</MenuItem>
            <MenuItem value="terminated">{de ? 'Ausgeschieden' : 'Terminated'}</MenuItem>
          </Select>
        </FormControl>
        {departments.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{de ? 'Abteilung' : 'Department'}</InputLabel>
            <Select value={deptFilter} label={de ? 'Abteilung' : 'Department'} onChange={e => setDept(e.target.value)}>
              <MenuItem value="">{de ? 'Alle Abteilungen' : 'All departments'}</MenuItem>
              {departments.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </Select>
          </FormControl>
        )}
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!isLoading && !isError && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{de ? 'Mitarbeiter' : 'Employee'}</TableCell>
                <TableCell>{de ? 'Abteilung / Position' : 'Department / Position'}</TableCell>
                <TableCell>{de ? 'Status' : 'Status'}</TableCell>
                <TableCell>{de ? 'Eintrittsdatum' : 'Start date'}</TableCell>
                <TableCell align="right">{de ? 'Bruttolohn / -gehalt' : 'Gross salary'}</TableCell>
                <TableCell>{de ? 'Lohnart' : 'Type'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                    {de ? 'Keine Mitarbeiter gefunden.' : 'No employees found.'}
                  </TableCell>
                </TableRow>
              )}
              {employees.map(emp => (
                <TableRow key={emp._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/mitarbeiter/${emp._id}`)}>
                  <TableCell>
                    <Stack direction="row" alignItems="center" gap={1.5}>
                      <Avatar sx={{ width: 32, height: 32, fontSize: 13 }}>
                        {initials(emp.firstName, emp.lastName)}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{emp.lastName}, {emp.firstName}</Typography>
                        <Typography variant="caption" color="text.secondary" fontFamily="monospace">{emp.employeeNumber}</Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    {emp.department && <Typography variant="body2">{emp.department}</Typography>}
                    {emp.position   && <Typography variant="caption" color="text.secondary">{emp.position}</Typography>}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={STATUS_COLOR[emp.status]}
                      label={emp.status === 'active' ? (de ? 'Aktiv' : 'Active') : emp.status === 'inactive' ? (de ? 'Inaktiv' : 'Inactive') : (de ? 'Ausgeschieden' : 'Terminated')}
                    />
                  </TableCell>
                  <TableCell>{new Date(emp.startDate).toLocaleDateString(locale)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {emp.salaryCents > 0 ? fmtCents(emp.salaryCents, locale) : '—'}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {emp.salaryType === 'monthly' ? (de ? 'Gehalt/Monat' : 'Monthly') : (de ? 'Stundenlohn' : 'Hourly')}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
