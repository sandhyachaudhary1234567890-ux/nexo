const { parse } = require('csv-parse/sync');
const axios = require('axios');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/helpers');
const Lead = require('../models/Lead');
const logger = require('../config/logger');

// ─── GET LEADS ───────────────────────────────────────────────────────────────
exports.getLeads = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    source,
    country,
    industry,
    search,
    minScore,
    maxScore,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const filter = { createdBy: req.user._id };

  if (status) filter.status = status;
  if (source) filter.source = source;
  if (country) filter.country = country;
  if (industry) filter.industry = industry;

  if (minScore || maxScore) {
    filter.score = {};
    if (minScore) filter.score.$gte = Number(minScore);
    if (maxScore) filter.score.$lte = Number(maxScore);
  }

  if (search) {
    filter.$or = [
      { companyName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { website: { $regex: search, $options: 'i' } },
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
    ];
  }

  const pageNum = Number(page);
  const limitNum = Math.min(Number(limit), 100); // cap at 100
  const skip = (pageNum - 1) * limitNum;
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .sort({ [sortBy]: sortDir })
      .skip(skip)
      .limit(limitNum)
      .populate('assignedTo', 'name email avatar')
      .lean(),
    Lead.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: leads,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

// ─── CREATE LEAD ─────────────────────────────────────────────────────────────
exports.createLead = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    companyName,
    website,
    industry,
    country,
    city,
    employees,
    revenue,
    linkedinUrl,
    status,
    source,
    tags,
    notes,
    assignedTo,
  } = req.body;

  if (!companyName && !email) {
    throw new AppError('At least company name or email is required', 400);
  }

  // Check for duplicate email under this user
  if (email) {
    const duplicate = await Lead.findOne({ email, createdBy: req.user._id });
    if (duplicate) throw new AppError('A lead with this email already exists', 409);
  }

  const lead = await Lead.create({
    firstName,
    lastName,
    email,
    phone,
    companyName,
    website,
    industry,
    country,
    city,
    employees,
    revenue,
    linkedinUrl,
    status: status || 'new',
    source: source || 'manual',
    tags: Array.isArray(tags) ? tags : [],
    notes,
    assignedTo,
    createdBy: req.user._id,
  });

  logger.info(`Lead created: ${lead._id} by user ${req.user._id}`);

  res.status(201).json({
    success: true,
    data: lead,
    message: 'Lead created successfully',
  });
});

// ─── IMPORT CSV ──────────────────────────────────────────────────────────────
exports.importCSV = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('CSV file is required', 400);

  let records;
  try {
    records = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    throw new AppError(`Failed to parse CSV: ${err.message}`, 400);
  }

  if (!records || records.length === 0) {
    throw new AppError('CSV file is empty or has no valid rows', 400);
  }

  const MAX_IMPORT = 5000;
  if (records.length > MAX_IMPORT) {
    throw new AppError(`CSV cannot exceed ${MAX_IMPORT} rows per import`, 400);
  }

  const errors = [];
  const validLeads = [];

  // Column name aliases for flexibility
  const fieldMap = {
    firstName: ['first_name', 'firstname', 'first name', 'fname'],
    lastName: ['last_name', 'lastname', 'last name', 'lname'],
    email: ['email', 'email_address', 'emailaddress'],
    phone: ['phone', 'phone_number', 'phonenumber', 'mobile'],
    companyName: ['company', 'company_name', 'companyname', 'organization'],
    website: ['website', 'url', 'web'],
    industry: ['industry', 'sector'],
    country: ['country'],
    city: ['city', 'location'],
    linkedinUrl: ['linkedin', 'linkedin_url', 'linkedinurl'],
    employees: ['employees', 'employee_count', 'company_size', 'size'],
    revenue: ['revenue', 'annual_revenue'],
  };

  const resolveField = (row, fieldAliases) => {
    const rowLower = Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v])
    );
    for (const alias of fieldAliases) {
      if (rowLower[alias] !== undefined && rowLower[alias] !== '') {
        return rowLower[alias];
      }
    }
    return undefined;
  };

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    try {
      const email = resolveField(row, fieldMap.email);
      const companyName = resolveField(row, fieldMap.companyName);

      if (!email && !companyName) {
        errors.push({ row: i + 2, error: 'Missing both email and company name' });
        continue;
      }

      const leadData = {
        createdBy: req.user._id,
        source: 'csv_import',
        status: 'new',
      };

      for (const [field, aliases] of Object.entries(fieldMap)) {
        const val = resolveField(row, aliases);
        if (val !== undefined) leadData[field] = val;
      }

      // Parse numeric fields
      if (leadData.employees) leadData.employees = parseInt(leadData.employees, 10) || undefined;
      if (leadData.revenue) leadData.revenue = parseFloat(leadData.revenue) || undefined;

      validLeads.push(leadData);
    } catch (err) {
      errors.push({ row: i + 2, error: err.message });
    }
  }

  let imported = 0;

  if (validLeads.length > 0) {
    const ops = validLeads.map((lead) => ({
      updateOne: {
        filter: {
          createdBy: req.user._id,
          ...(lead.email ? { email: lead.email } : { companyName: lead.companyName }),
        },
        update: { $setOnInsert: lead },
        upsert: true,
      },
    }));

    const result = await Lead.bulkWrite(ops, { ordered: false });
    imported = result.upsertedCount;
  }

  logger.info(`CSV import by user ${req.user._id}: ${imported} imported, ${errors.length} errors`);

  res.status(200).json({
    success: true,
    data: {
      total: records.length,
      imported,
      skipped: records.length - validLeads.length - errors.length,
      errors: errors.slice(0, 50), // cap error list
    },
    message: `Imported ${imported} leads successfully`,
  });
});

// ─── SEARCH EXTERNAL (APOLLO) ─────────────────────────────────────────────────
exports.searchExternal = asyncHandler(async (req, res) => {
  const {
    query,
    jobTitles,
    industries,
    countries,
    employeeMin,
    employeeMax,
    page = 1,
    perPage = 25,
  } = req.body;

  const apiKey = req.user.integrations?.apolloApiKey || process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new AppError('Apollo API key not configured. Please add it in Settings > Integrations.', 400);
  }

  try {
    const payload = {
      api_key: apiKey,
      q_organization_keyword_tags: query ? [query] : undefined,
      person_titles: jobTitles || [],
      organization_industry_tag_ids: industries || [],
      person_locations: countries || [],
      organization_num_employees_ranges: employeeMin || employeeMax
        ? [`${employeeMin || 1},${employeeMax || 999999}`]
        : undefined,
      page,
      per_page: Math.min(perPage, 100),
    };

    // Remove undefined fields
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    const { data } = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      payload,
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    res.status(200).json({
      success: true,
      data: {
        people: data.people || [],
        pagination: data.pagination || {},
        breadcrumbs: data.breadcrumbs || [],
      },
    });
  } catch (err) {
    logger.error('Apollo API error:', err.response?.data || err.message);
    if (err.response?.status === 401) {
      throw new AppError('Invalid Apollo API key', 401);
    }
    throw new AppError('Apollo API search failed. Please try again.', 502);
  }
});

// ─── GET LEAD ────────────────────────────────────────────────────────────────
exports.getLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({
    _id: req.params.id,
    createdBy: req.user._id,
  }).populate('assignedTo', 'name email avatar');

  if (!lead) throw new AppError('Lead not found', 404);

  res.status(200).json({ success: true, data: lead });
});

// ─── UPDATE LEAD ─────────────────────────────────────────────────────────────
exports.updateLead = asyncHandler(async (req, res) => {
  const forbidden = ['createdBy', '_id', '__v'];
  for (const field of forbidden) {
    delete req.body[field];
  }

  const lead = await Lead.findOneAndUpdate(
    { _id: req.params.id, createdBy: req.user._id },
    { $set: req.body },
    { new: true, runValidators: true }
  ).populate('assignedTo', 'name email avatar');

  if (!lead) throw new AppError('Lead not found', 404);

  logger.info(`Lead updated: ${lead._id}`);

  res.status(200).json({
    success: true,
    data: lead,
    message: 'Lead updated successfully',
  });
});

// ─── DELETE LEAD ─────────────────────────────────────────────────────────────
exports.deleteLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOneAndDelete({
    _id: req.params.id,
    createdBy: req.user._id,
  });

  if (!lead) throw new AppError('Lead not found', 404);

  logger.info(`Lead deleted: ${req.params.id} by user ${req.user._id}`);

  res.status(200).json({
    success: true,
    message: 'Lead deleted successfully',
  });
});

// ─── ENRICH LEAD ─────────────────────────────────────────────────────────────
exports.enrichLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({
    _id: req.params.id,
    createdBy: req.user._id,
  });

  if (!lead) throw new AppError('Lead not found', 404);

  // Check if already queued or being enriched
  if (lead.enrichmentStatus === 'processing') {
    throw new AppError('Lead enrichment is already in progress', 409);
  }

  // Add to enrichment queue
  const { enrichmentQueue } = require('../queues');
  await enrichmentQueue.add(
    'enrich-lead',
    { leadId: lead._id.toString(), userId: req.user._id.toString() },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    }
  );

  // Mark lead as queued
  await Lead.findByIdAndUpdate(lead._id, {
    enrichmentStatus: 'queued',
    enrichmentQueuedAt: new Date(),
  });

  logger.info(`Lead ${lead._id} added to enrichment queue by user ${req.user._id}`);

  res.status(202).json({
    success: true,
    message: 'Lead added to enrichment queue',
    data: { leadId: lead._id, status: 'queued' },
  });
});
