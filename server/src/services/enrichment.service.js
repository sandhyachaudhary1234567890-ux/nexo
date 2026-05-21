'use strict';
const axios = require('axios');
const logger = require('../config/logger');
const { env } = require('../config/env');
const Lead = require('../models/Lead');
const aiService = require('./ai.service');
const socketService = require('./socket.service');

async function enrichFromApollo(domain) {
  if (!env.APOLLO_API_KEY) return null;
  try {
    const { data } = await axios.get('https://api.apollo.io/v1/organizations/enrich', {
      params: { domain },
      headers: { 'x-api-key': env.APOLLO_API_KEY, 'Content-Type': 'application/json' },
      timeout: 10000
    });
    if (!data?.organization) return null;
    const org = data.organization;
    return {
      description: org.short_description || '',
      employees: org.estimated_num_employees || 0,
      revenue: org.annual_revenue_printed || '',
      technologies: org.technology_names || [],
      socialProfiles: {
        linkedin: org.linkedin_url || '',
        twitter: org.twitter_url || '',
        facebook: org.facebook_url || ''
      }
    };
  } catch (err) {
    logger.warn('[Enrichment] Apollo failed:', err.message);
    return null;
  }
}

async function enrichFromHunter(domain) {
  if (!env.HUNTER_API_KEY) return null;
  try {
    const { data } = await axios.get('https://api.hunter.io/v2/domain-search', {
      params: { domain, api_key: env.HUNTER_API_KEY, limit: 5 },
      timeout: 10000
    });
    if (!data?.data) return null;
    return {
      description: data.data.organization || '',
      employees: 0,
      revenue: '',
      technologies: [],
      socialProfiles: { linkedin: data.data.linkedin || '' },
      emails: (data.data.emails || []).slice(0, 5).map(e => ({
        email: e.value,
        type: e.type,
        confidence: e.confidence
      }))
    };
  } catch (err) {
    logger.warn('[Enrichment] Hunter failed:', err.message);
    return null;
  }
}

async function enrichFromClearbit(domain) {
  if (!env.CLEARBIT_API_KEY) return null;
  try {
    const { data } = await axios.get('https://company.clearbit.com/v2/companies/find', {
      params: { domain },
      headers: { Authorization: `Bearer ${env.CLEARBIT_API_KEY}` },
      timeout: 10000
    });
    if (!data) return null;
    return {
      description: data.description || '',
      employees: data.metrics?.employees || 0,
      revenue: data.metrics?.annualRevenueFormatted || '',
      technologies: data.tech || [],
      socialProfiles: {
        linkedin: data.linkedin?.handle ? `https://linkedin.com/company/${data.linkedin.handle}` : '',
        twitter: data.twitter?.handle ? `https://twitter.com/${data.twitter.handle}` : ''
      }
    };
  } catch (err) {
    logger.warn('[Enrichment] Clearbit failed:', err.message);
    return null;
  }
}

async function enrichWithAI(lead) {
  try {
    const customKeys = lead.createdBy?.preferences || {};
    const parsed = await aiService.enrichLeadData({
      companyName: lead.companyName,
      website: lead.website,
      industry: lead.industry
    }, customKeys);

    if (parsed) {
      return {
        description: parsed.companyDescription || parsed.description || '',
        employees: parsed.employees || parsed.employeeRange || 0,
        revenue: parsed.revenue || parsed.annualRevenueRange || '',
        technologies: Array.isArray(parsed.technologies) ? parsed.technologies : [],
        socialProfiles: parsed.socialProfiles || {}
      };
    }
  } catch (err) {
    logger.warn('[Enrichment] AI fallback failed:', err.message);
  }
  return null;
}

async function enrichByDomain(domain, leadId) {
  const lead = await Lead.findById(leadId).populate('createdBy');
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  let enrichmentData = null;

  // Waterfall: Apollo → Hunter → Clearbit → AI
  enrichmentData = await enrichFromApollo(domain);
  if (!enrichmentData) enrichmentData = await enrichFromHunter(domain);
  if (!enrichmentData) enrichmentData = await enrichFromClearbit(domain);
  if (!enrichmentData) enrichmentData = await enrichWithAI(lead);

  if (enrichmentData) {
    const updated = await Lead.findByIdAndUpdate(
      leadId,
      { enriched: true, enrichmentData },
      { new: true }
    );
    const ownerId = lead.createdBy?._id || lead.createdBy;
    if (ownerId) {
      socketService.emitToUser(ownerId.toString(), 'lead:enriched', { leadId, enrichmentData });
    }
    logger.info(`[Enrichment] Lead ${leadId} enriched successfully`);
    return updated;
  }

  logger.warn(`[Enrichment] No data found for domain: ${domain}`);
  return lead;
}

async function enrichByEmail(email, leadId) {
  const domain = email.split('@')[1];
  if (!domain) return null;
  return enrichByDomain(domain, leadId);
}

async function bulkEnrich(leads) {
  const results = [];
  for (const lead of leads) {
    try {
      const domain =
        lead.website?.replace(/^https?:\/\//, '').split('/')[0] ||
        lead.email?.split('@')[1];
      if (domain) results.push(await enrichByDomain(domain, lead._id));
      else results.push(null);
    } catch (err) {
      logger.error(`[Enrichment] Bulk error for lead ${lead._id}:`, err.message);
      results.push(null);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  return results;
}

module.exports = {
  enrichFromApollo,
  enrichFromHunter,
  enrichFromClearbit,
  enrichWithAI,
  enrichByDomain,
  enrichByEmail,
  bulkEnrich
};
