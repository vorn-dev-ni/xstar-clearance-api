import { CreateInvoiceDto } from './create-invoice.dto';

/**
 * Editing an invoice is a full replacement of its fields + line items, so the
 * payload is identical to create. The service restricts edits to DRAFT/ISSUED.
 */
export class UpdateInvoiceDto extends CreateInvoiceDto {}
