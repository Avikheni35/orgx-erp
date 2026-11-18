import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Paper, Chip, IconButton, Tooltip, Stack, CircularProgress,
  Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem, Grid,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import { userManagementApi, type ErpUser, type CreateErpUserData } from '../../../api/userManagement';
import { useCanWrite } from '../../../hooks/useCanWrite';

const ROLE_OPTIONS: CreateErpUserData['role'][] = [
  'erp_admin', 'erp_accountant', 'erp_viewer', 'erp_employee', 'erp_tax_advisor',
];

function roleBadgeColor(role: string): 'error' | 'warning' | 'info' | 'default' | 'success' {
  switch (role) {
    case 'erp_admin':        return 'error';
    case 'erp_accountant':   return 'warning';
    case 'erp_tax_advisor':  return 'info';
    case 'erp_viewer':       return 'default';
    default:                 return 'default';
  }
}

function roleLabel(role: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    erp_admin:       t('userMgmt.role.erp_admin'),
    erp_accountant:  t('userMgmt.role.erp_accountant'),
    erp_viewer:      t('userMgmt.role.erp_viewer'),
    erp_employee:    t('userMgmt.role.erp_employee'),
    erp_tax_advisor: t('userMgmt.role.erp_tax_advisor'),
  };
  return map[role] ?? role;
}

const emptyForm = (): CreateErpUserData => ({
  email: '', firstName: '', lastName: '', role: 'erp_tax_advisor', password: '',
});

export default function UserManagementPage() {
  const { t } = useTranslation();
  const canWrite = useCanWrite();
  const queryClient = useQueryClient();

  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ErpUser | null>(null);
  const [form,         setForm]         = useState<CreateErpUserData>(emptyForm());
  const [formErr,      setFormErr]      = useState('');
  const [successMsg,   setSuccessMsg]   = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['erp-users'],
    queryFn:  () => userManagementApi.list().then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: (d: CreateErpUserData) => userManagementApi.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erp-users'] });
      setDialogOpen(false);
      setForm(emptyForm());
      setSuccessMsg(t('userMgmt.createSuccess'));
      setTimeout(() => setSuccessMsg(''), 4000);
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setFormErr(msg || t('common.error'));
    },
  });

  const toggleMut = useMutation({
    mutationFn: (id: string) => userManagementApi.toggleStatus(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['erp-users'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => userManagementApi.delete(id),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['erp-users'] });
    },
  });

  const handleCreate = () => {
    setFormErr('');
    if (!form.email || !form.firstName || !form.lastName || !form.password) {
      setFormErr(t('userMgmt.err.required'));
      return;
    }
    if (form.password.length < 8) {
      setFormErr(t('userMgmt.err.password'));
      return;
    }
    createMut.mutate(form);
  };

  const users = data?.users ?? [];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('userMgmt.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('userMgmt.subtitle')}</Typography>
        </Box>
        {canWrite && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm(emptyForm()); setFormErr(''); setDialogOpen(true); }}>
            {t('userMgmt.addUser')}
          </Button>
        )}
      </Stack>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}
      {isLoading  && <CircularProgress />}
      {error      && <Alert severity="error">{String(error)}</Alert>}

      {!isLoading && !error && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('userMgmt.col.name')}</TableCell>
                <TableCell>{t('userMgmt.col.email')}</TableCell>
                <TableCell>{t('userMgmt.col.role')}</TableCell>
                <TableCell>{t('userMgmt.col.status')}</TableCell>
                <TableCell>{t('userMgmt.col.lastLogin')}</TableCell>
                {canWrite && <TableCell align="right">{t('recurring.col.actions')}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    {t('userMgmt.empty')}
                  </TableCell>
                </TableRow>
              )}
              {users.map(u => (
                <TableRow key={u._id} hover sx={{ opacity: u.status !== 'active' ? 0.6 : 1 }}>
                  <TableCell sx={{ fontWeight: 600 }}>{u.firstName} {u.lastName}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Chip label={roleLabel(u.role, t)} size="small" color={roleBadgeColor(u.role)} variant="outlined" />
                    {u.role === 'erp_tax_advisor' && (
                      <Chip label="🔒 Steuerberater" size="small" sx={{ ml: 0.5, bgcolor: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d' }} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={u.status === 'active' ? t('userMgmt.status.active') : t('userMgmt.status.inactive')}
                      size="small"
                      color={u.status === 'active' ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('de-DE') : '—'}
                  </TableCell>
                  {canWrite && (
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title={u.status === 'active' ? t('userMgmt.deactivate') : t('userMgmt.activate')}>
                          <IconButton size="small" onClick={() => toggleMut.mutate(u._id)} disabled={toggleMut.isPending}>
                            {u.status === 'active'
                              ? <BlockIcon fontSize="small" color="warning" />
                              : <CheckCircleIcon fontSize="small" color="success" />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('common.delete')}>
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(u)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create user dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('userMgmt.addUser')}</DialogTitle>
        <DialogContent>
          {formErr && <Alert severity="error" sx={{ mb: 2 }}>{formErr}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={6}>
              <TextField label={t('userMgmt.field.firstName')} fullWidth size="small"
                value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
            </Grid>
            <Grid item xs={6}>
              <TextField label={t('userMgmt.field.lastName')} fullWidth size="small"
                value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <TextField label={t('userMgmt.field.email')} fullWidth size="small" type="email"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('userMgmt.field.role')}</InputLabel>
                <Select value={form.role} label={t('userMgmt.field.role')}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as CreateErpUserData['role'] }))}>
                  {ROLE_OPTIONS.map(r => (
                    <MenuItem key={r} value={r}>{roleLabel(r, t)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField label={t('userMgmt.field.password')} fullWidth size="small" type="password"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                helperText={t('userMgmt.field.passwordHelp')} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleCreate} disabled={createMut.isPending}>
            {createMut.isPending ? <CircularProgress size={18} /> : t('userMgmt.createBtn')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t('userMgmt.deleteTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('userMgmt.deleteConfirm', { name: `${deleteTarget?.firstName} ${deleteTarget?.lastName}` })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
          <Button variant="contained" color="error"
            onClick={() => deleteTarget && deleteMut.mutate(deleteTarget._id)}
            disabled={deleteMut.isPending}>
            {t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
