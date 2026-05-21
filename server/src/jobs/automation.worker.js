'use strict';
const { Worker } = require('bullmq');
const { getRedisConnection } = require('../config/redis');
const Automation = require('../models/Automation');
const Lead = require('../models/Lead');
const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

function evaluateCondition(condition, triggerData) {
  const { field, operator, value } = condition;
  const actual = triggerData[field];
  switch (operator) {
    case 'equals': return String(actual) === String(value);
    case 'not_equals': return String(actual) !== String(value);
    case 'contains': return String(actual || '').toLowerCase().includes(String(value).toLowerCase());
    case 'greater_than': return Number(actual) > Number(value);
    case 'less_than': return Number(actual) < Number(value);
    case 'exists': return actual !== undefined && actual !== null && actual !== '';
    default: return true;
  }
}

async function executeAction(action, automation, triggerData) {
  const { type, params } = action;
  const { notificationQueue, outreachQueue } = require('./queues');

  switch (type) {
    case 'send_email':
      if (params.templateId && triggerData.leadId) {
        await outreachQueue.add('send-email', {
          type: 'send-email',
          campaignId: params.campaignId,
          leadId: triggerData.leadId,
          templateId: params.templateId,
          userId: automation.owner
        });
      }
      break;
    case 'update_lead_status':
      if (triggerData.leadId && params.status) {
        await Lead.findByIdAndUpdate(triggerData.leadId, { status: params.status });
        logger.info(`[AutomationWorker] Updated lead ${triggerData.leadId} status to ${params.status}`);
      }
      break;
    case 'create_notification':
      await notificationQueue.add('push-notification', {
        userId: automation.owner.toString(),
        type: 'automation',
        title: params.title || `Automation: ${automation.name}`,
        body: params.body || 'An automation was triggered',
        metadata: { automationId: automation._id, triggerData }
      });
      break;
    case 'add_to_campaign': {
      const Campaign = require('../models/Campaign');
      if (params.campaignId && triggerData.leadId) {
        await Campaign.findByIdAndUpdate(params.campaignId, { $addToSet: { leads: triggerData.leadId } });
      }
      break;
    }
    default:
      logger.warn(`[AutomationWorker] Unknown action type: ${type}`);
  }
}

const worker = new Worker('automation', async (job) => {
  const { automationId, triggerData = {} } = job.data;
  const automation = await Automation.findById(automationId);
  if (!automation || !automation.isActive) return { skipped: true, reason: 'not found or inactive' };

  const conditionsMet = automation.conditions.length === 0 ||
    automation.conditions.every(c => evaluateCondition(c, triggerData));

  if (!conditionsMet) return { skipped: true, reason: 'conditions not met' };

  for (const action of automation.actions) {
    try {
      await executeAction(action, automation, triggerData);
    } catch (err) {
      logger.error(`[AutomationWorker] Action ${action.type} failed: ${err.message}`);
    }
  }

  await Automation.findByIdAndUpdate(automationId, { lastRun: new Date(), $inc: { runCount: 1 } });
  await AuditLog.create({
    userId: automation.owner,
    action: 'automation_ran',
    resource: 'Automation',
    resourceId: automationId.toString(),
    metadata: { triggerData, actionsExecuted: automation.actions.length }
  });

  return { success: true, actionsExecuted: automation.actions.length };
}, { connection: getRedisConnection(), concurrency: 2 });

worker.on('completed', (job, result) => logger.info(`[AutomationWorker] Job ${job.id} done:`, result));
worker.on('failed', (job, err) => logger.error(`[AutomationWorker] Job ${job?.id} failed: ${err.message}`));

module.exports = worker;
