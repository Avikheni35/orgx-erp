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
import { suppliersApi } from '../../../api/suppliers';

export default function SupplierListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [search, setSearch]       = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [page, setPage]           = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', search, activeOnly, page],
    queryFn: () => suppliersApi.list({
      search: search || undefined,
      active: activeOnly ? true : undefined,
      page,
      limit: 50,
    }),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => suppliersApi.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
  const reactivate = useMutation({
    mutationFn: (id: string) => suppliersApi.reactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  const suppliers  = data?.data?.suppliers  ?? [];
  const total      = data?.data?.total      ?? 0;
  const totalPages = data?.data?.totalPages ?? 1;

  const primaryEmail = (contacts: { email?: string; isPrimary: boolean }[]) =>
    contacts.find(c => c.isPrimary)?.email ?? contacts[0]?.email ?? '—';

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('suppliers.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('suppliers.count', { count: total })}</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/lieferanten/new')}>
          {t('suppliers.createSupplier')}
        </Button>
      </Stack>

      <Card sx={{ mb: 3, p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems="center">
          <TextField
            size="small"
            placeholder={t('suppliers.searchPlaceholder')}
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
        ) : suppliers.length === 0 ? (
          <Box textAlign="center" py={6}>
            <Typography color="text.secondary">{t('suppliers.noSuppliers')}</Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('suppliers.supplierNumber')}</TableCell>
                <TableCell>{t('suppliers.companyName')}</TableCell>
                <TableCell>{t('suppliers.legalForm')}</TableCell>
                <TableCell>{t('suppliers.contactEmail')}</TableCell>
                <TableCell align="right">{t('suppliers.paymentTermsDays')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell align="right">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {suppliers.map(s => (
                <TableRow key={s._id} hover>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontWeight={600}>{s.supplierNumber}</Typography>
                  </TableCell>
                  <TableCell>{s.companyName}</TableCell>
                  <TableCell>{s.legalForm ?? '—'}</TableCell>
                  <TableCell>{primaryEmail(s.contacts)}</TableCell>
                  <TableCell align="right">{s.paymentTermsDays} d</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={s.isActive ? t('common.active') : t('common.inactive')}
                      color={s.isActive ? 'success' : 'default'}
                    />
                    {s.paymentBlock && (
                      <Chip size="small" label={t('suppliers.paymentBlock')} color="warning" sx={{ ml: 0.5 }} />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                      <Tooltip title={t('common.details')}>
                        <IconButton size="small" onClick={() => navigate(`/erp/lieferanten/${s._id}`)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {s.isActive ? (
                        <Tooltip title={t('common.deactivate')}>
                          <IconButton size="small" color="error" onClick={() => deactivate.mutate(s._id)}>
                            <BlockIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title={t('common.reactivate')}>
                          <IconButton size="small" color="success" onClick={() => reactivate.mutate(s._id)}>
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
