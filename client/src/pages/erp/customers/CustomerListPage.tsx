import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, Table, TableHead, TableBody, TableRow, TableCell,
  Chip, Stack, TextField, Pagination, Tooltip, IconButton, CircularProgress,
  InputAdornment, Switch, FormControlLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useTranslation } from 'react-i18next';
import { customersApi } from '../../../api/customers';
import { useCanWrite } from '../../../hooks/useCanWrite';

export default function CustomerListPage() {
  const navigate  = useNavigate();
  const { t, i18n } = useTranslation();
  const de = i18n.language === 'de';
  const canWrite  = useCanWrite();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, activeOnly, page],
    queryFn: () => customersApi.list({
      search: search || undefined,
      active: activeOnly ? true : undefined,
      page,
      limit: 50,
    }),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => customersApi.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
  const reactivate = useMutation({
    mutationFn: (id: string) => customersApi.reactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });

  const customers  = data?.data?.customers   ?? [];
  const total      = data?.data?.total       ?? 0;
  const totalPages = data?.data?.totalPages  ?? 1;

  const primaryEmail = (contacts: { email?: string; isPrimary: boolean }[]) =>
    contacts.find(c => c.isPrimary)?.email ?? contacts[0]?.email ?? '—';

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('customers.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('customers.count', { count: total })}</Typography>
        </Box>
        {canWrite && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/kunden/new')}>
            {t('customers.createCustomer')}
          </Button>
        )}
      </Stack>

      <Card sx={{ mb: 3, p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems="center">
          <TextField
            size="small"
            placeholder={t('customers.searchPlaceholder')}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            sx={{ flex: 1 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <FormControlLabel
            control={<Switch checked={activeOnly} onChange={e => { setActiveOnly(e.target.checked); setPage(1); }} />}
            label={t('common.active')}
          />
        </Stack>
      </Card>

      <Card>
        {isLoading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : customers.length === 0 ? (
          <Box textAlign="center" py={6}>
            <Typography color="text.secondary">{t('customers.noCustomers')}</Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('customers.customerNumber')}</TableCell>
                <TableCell>{t('customers.companyName')}</TableCell>
                <TableCell>{t('customers.legalForm')}</TableCell>
                <TableCell>{t('customers.contactEmail')}</TableCell>
                <TableCell align="right">{t('customers.paymentTermsDays')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell align="right">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {customers.map(c => (
                <TableRow key={c._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/kunden/${c._id}`)}>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontWeight={600}>{c.customerNumber}</Typography>
                  </TableCell>
                  <TableCell>{c.companyName}</TableCell>
                  <TableCell>{c.legalForm ?? '—'}</TableCell>
                  <TableCell>{primaryEmail(c.contacts)}</TableCell>
                  <TableCell align="right">{c.paymentTermsDays} d</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={c.isActive ? t('common.active') : t('common.inactive')}
                      color={c.isActive ? 'success' : 'default'}
                    />
                    {c.dunningBlock && (
                      <Chip size="small" label={de ? 'Mahnsperre' : 'Dunning block'} color="warning" sx={{ ml: 0.5 }} />
                    )}
                  </TableCell>
                  <TableCell align="right" onClick={e => e.stopPropagation()}>
                    <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                      {c.isActive ? (
                        <Tooltip title={t('common.deactivate')}>
                          <IconButton size="small" color="error" onClick={() => deactivate.mutate(c._id)}>
                            <BlockIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title={t('common.reactivate')}>
                          <IconButton size="small" color="success" onClick={() => reactivate.mutate(c._id)}>
                            <CheckCircleIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {totalPages > 1 && (
          <Box display="flex" justifyContent="center" py={2}>
            <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} color="primary" />
          </Box>
        )}
      </Card>
    </Box>
  );
}
