'use strict';
const { Worker } = require('bullmq');
const { getRedisConnection } = require('../config/redis');
const Lead = require('../models/Lead');
const enrichmentService = require('../services/enrichment.service');
const logger = require('../config/logger');

const worker = new Worker('enrichment', async (job) => {
  const { leadId } = job.data;
  logger.info(`[EnrichmentWorker] Processing lead ${leadId}`);

  const lead = await Lead.findById(leadId);
  if (!lead) return { skipped: true, reason: 'lead not found' };
  if (lead.enriched) return { skipped: true, reason: 'already enriched' };

  const domain = lead.website
    ? lead.website.replace(/^https?:\/\//, '').split('/')[0]
    : lead.email?.split('@')[1] || null;

  if (!domain && !lead.companyName) return { skipped: true, reason: 'no domain or company name' };

  try {
    const updated = await enrichmentService.enrichByDomain(domain || lead.companyName, leadId);
    return { enriched: !!updated?.enrichmentData?.description, leadId };
  } catch (err) {
    logger.warn(`[EnrichmentWorker] Non-fatal enrichment error for ${leadId}: ${err.message}`);
    return { enriched: false, error: err.message };
  }
}, { connection: getRedisConnection(), concurrency: 3 });

worker.on('completed', (job, result) => logger.info(`[EnrichmentWorker] Job ${job.id} done:`, result));
worker.on('failed', (job, err) => logger.error(`[EnrichmentWorker] Job ${job?.id} failed: ${err.message}`));

module.exports = worker;
