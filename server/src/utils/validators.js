'use strict';

const { z } = require('zod');
const { AppError } = require('./helpers');

// ─────────────────────────────────────────────
// Reusable field schemas
// ─────────────────────────────────────────────

const emailField = z.string().email('Invalid email address').toLowerCase().trim();
const passwordField = z.string().min(8, 'Password must be at least 8 characters');
const objectIdField = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID format');

// ─────────────────────────────────────────────
// Auth schemas
// ─────────────────────────────────────────────

/**
 * Schema for user registration.
 */
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim(),
  email: emailField,
  password: passwordField,
});

/**
 * Schema for user login.
 */
const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
});

/**
 * Schema for refreshing tokens.
 */
const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ─────────────────────────────────────────────
// Lead schema
// ─────────────────────────────────────────────

/**
 * Schema for creating or updating a lead.
 */
const leadSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(200).trim(),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  email: emailField.optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  jobTitle: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  employeeCount: z.number().int().positive().optional(),
  revenue: z.number().nonnegative().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  source: z
    .enum(['manual', 'csv', 'api', 'apollo', 'hunter', 'clearbit', 'website'])
    .optional(),
  notes: z.string().max(5000).optional(),
});

// ─────────────────────────────────────────────
// Campaign schema
// ─────────────────────────────────────────────

/**
 * Schema for creating or updating a campaign.
 */
const campaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(200).trim(),
  type: z.enum(['email', 'linkedin', 'sms', 'multi-channel']),
  templateId: objectIdField.optional(),
  leads: z.array(objectIdField).optional(),
  subject: z.string().max(500).optional(),
  scheduledAt: z.string().datetime().optional(),
  settings: z
    .object({
      sendingRate: z.number().int().min(1).max(500).optional(),
      followUpDelayDays: z.number().int().min(1).max(30).optional(),
      timezone: z.string().optional(),
    })
    .optional(),
});

// ─────────────────────────────────────────────
// Template schema
// ─────────────────────────────────────────────

/**
 * Schema for email/message templates.
 */
const templateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(200).trim(),
  type: z.enum(['email', 'linkedin', 'sms', 'whatsapp']),
  subject: z.string().max(500).optional(),
  body: z.string().min(1, 'Template body is required').max(50000),
  variables: z.array(z.string().max(100)).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

// ─────────────────────────────────────────────
// Automation schema
// ─────────────────────────────────────────────

/**
 * Schema for automation workflows.
 */
const automationSchema = z.object({
  name: z.string().min(1, 'Automation name is required').max(200).trim(),
  trigger: z.enum([
    'lead_created',
    'lead_status_changed',
    'deal_stage_changed',
    'email_opened',
    'email_clicked',
    'form_submitted',
    'schedule',
  ]),
  conditions: z
    .array(
      z.object({
        field: z.string().max(100),
        operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'gt', 'lt', 'exists']),
        value: z.any(),
      })
    )
    .optional(),
  actions: z.array(
    z.object({
      type: z.enum([
        'send_email',
        'send_sms',
        'create_task',
        'update_lead',
        'add_tag',
        'move_stage',
        'notify_user',
        'webhook',
      ]),
      config: z.record(z.any()),
    })
  ),
  schedule: z
    .object({
      cronExpression: z.string().optional(),
      timezone: z.string().optional(),
    })
    .optional(),
  isActive: z.boolean().optional(),
});

// ─────────────────────────────────────────────
// Deal schema
// ─────────────────────────────────────────────

/**
 * Schema for CRM deals.
 */
const dealSchema = z.object({
  title: z.string().min(1, 'Deal title is required').max(200).trim(),
  contactId: objectIdField.optional(),
  leadId: objectIdField.optional(),
  pipelineId: objectIdField,
  stageId: objectIdField,
  value: z.number().nonnegative().optional(),
  currency: z.string().length(3).default('USD'),
  closeDate: z.string().datetime().optional(),
  probability: z.number().min(0).max(100).optional(),
  notes: z.string().max(10000).optional(),
});

// ─────────────────────────────────────────────
// validate() middleware factory
// ─────────────────────────────────────────────

/**
 * Express middleware factory for Zod request validation.
 * Validates req.body against the provided schema.
 * Attaches the parsed (coerced) data back to req.body on success.
 *
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware
 *
 * @example
 * router.post('/register', validate(registerSchema), authController.register);
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return next(new AppError('Validation failed', 400, errors));
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  leadSchema,
  campaignSchema,
  templateSchema,
  automationSchema,
  dealSchema,
  objectIdField,
  validate,
};
