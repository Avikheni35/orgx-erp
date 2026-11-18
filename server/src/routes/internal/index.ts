import { Router } from 'express';
import { requireServiceToken } from '../../middleware/requireServiceToken';
import healthRouter        from './health';
import journalRouter       from './journalEntries';
import customersRouter     from './customers';
import payrollLinesRouter  from './payrollLines';
import salesInvoicesRouter from './salesInvoices';

const router = Router();

router.use(requireServiceToken);

router.use('/health',          healthRouter);
router.use('/journal-entries', journalRouter);
router.use('/customers',       customersRouter);
router.use('/payroll-lines',   payrollLinesRouter);
router.use('/sales-invoices',  salesInvoicesRouter);

export default router;
