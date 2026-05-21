'use strict';
const { Worker } = require('bullmq');
const { getRedisConnection } = require('../config/redis');
const emailService = require('../services/email.service');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const Template = require('../models/Template');
const logger = require('../config/logger');

const worker = new Worker('outreach', async (job) => {
  const { type, campaignId, leadId, templateId } = job.data;
  logger.info(`[OutreachWorker] Processing job ${job.id} | type: ${type}`);

  if (type === 'send-email') {
    const [campaign, lead, template] = await Promise.all([
      Campaign.findById(campaignId),
      Lead.findById(leadId),
      Template.findById(templateId)
    ]);

    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
    if (!lead) throw new Error(`Lead ${leadId} not found`);
    if (!template) throw new Error(`Template ${templateId} not found`);
    if (campaign.status === 'paused') return { skipped: true, reason: 'campaign paused' };
    if (!lead.email) return { skipped: true, reason: 'lead has no email' };

    await emailService.sendCampaignEmail({
      to: lead.email,
      subject: template.subject,
      template: template.body,
      variables: {
        firstName: lead.companyName,
        company: lead.companyName,
        website: lead.website || '',
        industry: lead.industry || ''
      },
      campaignId,
      leadId
    });

    return { sent: true, leadId, email: lead.email };
  }

  throw new Error(`Unknown outreach job type: ${type}`);
}, {
  connection: getRedisConnection(),
  concurrency: 5
});

worker.on('completed', (job, result) => logger.info(`[OutreachWorker] Job ${job.id} done:`, result));
worker.on('failed', (job, err) => logger.error(`[OutreachWorker] Job ${job?.id} failed: ${err.message}`));
worker.on('error', err => logger.error('[OutreachWorker] Error:', err.message));

module.exports = worker;
