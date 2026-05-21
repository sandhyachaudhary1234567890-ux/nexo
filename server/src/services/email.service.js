'use strict';
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const logger = require('../config/logger');
const { env } = require('../config/env');
const Campaign = require('../models/Campaign');
const socketService = require('./socket.service');
const { AppError } = require('../utils/helpers');

let transporter = null;

function createTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(env.SMTP_PORT || '587'),
    secure: parseInt(env.SMTP_PORT || '587') === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    tls: { rejectUnauthorized: false }
  });
  // Verify connection (non-blocking)
  transporter.verify()
    .then(() => logger.info('[Email] SMTP transporter ready'))
    .catch(err => logger.warn('[Email] SMTP verify failed:', err.message));
  return transporter;
}

function renderTemplate(templateString, variables = {}) {
  try {
    const compiled = handlebars.compile(templateString);
    return compiled(variables);
  } catch (err) {
    logger.error('[Email] Template render error:', err.message);
    return templateString;
  }
}

async function sendEmail({ to, subject, htmlBody, textBody, from, attachments }) {
  const t = createTransporter();
  const info = await t.sendMail({
    from: from || env.SMTP_FROM || env.SMTP_USER,
    to,
    subject,
    html: htmlBody,
    text: textBody || htmlBody?.replace(/<[^>]+>/g, '') || '',
    attachments
  });
  logger.info(`[Email] Sent to ${to}: ${info.messageId}`);
  return { messageId: info.messageId, success: true };
}

async function sendCampaignEmail({ to, subject, template, variables, campaignId, leadId }) {
  const htmlBody = renderTemplate(template, variables);
  // Add tracking pixel and link tracking
  const trackedBody =
    htmlBody.replace(/href="([^"]+)"/g, `href="$1?tracked=1&cid=${campaignId}"`) +
    `<img src="${env.CLIENT_URL || 'http://localhost:3000'}/api/campaigns/${campaignId}/track?type=open&lid=${leadId}" width="1" height="1" style="display:none" />`;
  try {
    await sendEmail({ to, subject, htmlBody: trackedBody });
    await Campaign.findByIdAndUpdate(campaignId, { $inc: { 'stats.sent': 1 } });
    return { success: true };
  } catch (err) {
    logger.error(`[Email] Campaign send failed for ${to}:`, err.message);
    await Campaign.findByIdAndUpdate(campaignId, { $inc: { 'stats.failed': 1 } });
    throw err;
  }
}

async function sendBulkEmails(leads, templateDoc, campaignId, userId) {
  let sent = 0, failed = 0;
  const total = leads.length;
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const RATE_LIMIT_MS = 100; // 10 emails/sec

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    try {
      await sendCampaignEmail({
        to: lead.email,
        subject: renderTemplate(templateDoc.subject, { company: lead.companyName, firstName: lead.companyName }),
        template: templateDoc.body,
        variables: {
          company: lead.companyName,
          firstName: lead.companyName,
          website: lead.website
        },
        campaignId,
        leadId: lead._id
      });
      sent++;
    } catch {
      failed++;
    }
    // Emit progress every 5 emails or on final iteration
    if ((i + 1) % 5 === 0 || i === leads.length - 1) {
      socketService.emitToUser(userId, 'campaign:update', {
        campaignId,
        sent,
        failed,
        total,
        progress: Math.round(((i + 1) / total) * 100)
      });
    }
    await delay(RATE_LIMIT_MS);
  }
  return { sent, failed, total };
}

module.exports = { createTransporter, renderTemplate, sendEmail, sendCampaignEmail, sendBulkEmails };
