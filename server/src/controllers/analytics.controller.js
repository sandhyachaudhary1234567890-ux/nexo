const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/helpers');
const Lead = require('../models/Lead');
const Contact = require('../models/Contact');
const Campaign = require('../models/Campaign');
const Call = require('../models/Call');
const Deal = require('../models/Deal');
const User = require('../models/User');
const logger = require('../config/logger');

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────
exports.getOverview = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalLeads,
    newLeads,
    totalContacts,
    activeCampaigns,
    callsThisMonth,
    totalDeals,
    closedWonDeals,
    user,
  ] = await Promise.all([
    Lead.countDocuments({ createdBy: userId }),
    Lead.countDocuments({ createdBy: userId, createdAt: { $gte: weekAgo } }),
    Contact.countDocuments({ owner: userId }),
    Campaign.countDocuments({ owner: userId, status: { $in: ['running', 'scheduled'] } }),
    Call.countDocuments({ owner: userId, createdAt: { $gte: monthAgo } }),
    Deal.countDocuments({ owner: userId }),
    Deal.countDocuments({ owner: userId, stage: 'Closed Won' }),
    User.findById(userId).select('credits plan'),
  ]);

  // Total pipeline value
  const pipelineAgg = await Deal.aggregate([
    { $match: { owner: userId, stage: { $nin: ['Closed Lost'] } } },
    { $group: { _id: null, totalValue: { $sum: '$value' } } },
  ]);
  const totalPipelineValue = pipelineAgg[0]?.totalValue || 0;

  res.status(200).json({
    success: true,
    data: {
      totalLeads,
      newLeads,
      totalContacts,
      activeCampaigns,
      callsThisMonth,
      totalDeals,
      closedWonDeals,
      totalPipelineValue,
      credits: user?.credits || 0,
      plan: user?.plan || 'free',
    },
  });
});

// ─── LEAD ANALYTICS ───────────────────────────────────────────────────────────
exports.getLeadAnalytics = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { days = 30 } = req.query;
  const daysNum = Math.min(Number(days), 365);
  const startDate = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000);

  // Run all aggregations in parallel
  const [byDate, byStatus, bySource, byIndustry, byCountry] = await Promise.all([
    // Leads grouped by date (last N days)
    Lead.aggregate([
      {
        $match: {
          createdBy: userId,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day',
            },
          },
          count: 1,
        },
      },
      { $sort: { date: 1 } },
    ]),

    // Leads grouped by status
    Lead.aggregate([
      { $match: { createdBy: userId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
      { $sort: { count: -1 } },
    ]),

    // Leads grouped by source
    Lead.aggregate([
      { $match: { createdBy: userId } },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $project: { _id: 0, source: '$_id', count: 1 } },
      { $sort: { count: -1 } },
    ]),

    // Leads grouped by industry (top 10)
    Lead.aggregate([
      { $match: { createdBy: userId, industry: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$industry', count: { $sum: 1 } } },
      { $project: { _id: 0, industry: '$_id', count: 1 } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),

    // Leads grouped by country (top 10)
    Lead.aggregate([
      { $match: { createdBy: userId, country: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$country', count: { $sum: 1 } } },
      { $project: { _id: 0, country: '$_id', count: 1 } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);

  res.status(200).json({
    success: true,
    data: {
      period: { days: daysNum, startDate },
      byDate,
      byStatus,
      bySource,
      byIndustry,
      byCountry,
    },
  });
});

// ─── OUTREACH ANALYTICS ───────────────────────────────────────────────────────
exports.getOutreachAnalytics = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { days = 30 } = req.query;
  const daysNum = Math.min(Number(days), 365);
  const startDate = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000);

  const [campaignStats, byStatus, topCampaigns] = await Promise.all([
    // Aggregate campaign stats
    Campaign.aggregate([
      {
        $match: {
          owner: userId,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          totalCampaigns: { $sum: 1 },
          totalSent: { $sum: '$stats.sent' },
          totalDelivered: { $sum: '$stats.delivered' },
          totalOpened: { $sum: '$stats.opened' },
          totalClicked: { $sum: '$stats.clicked' },
          totalReplied: { $sum: '$stats.replied' },
          totalBounced: { $sum: '$stats.bounced' },
          totalUnsubscribed: { $sum: '$stats.unsubscribed' },
        },
      },
      {
        $project: {
          _id: 0,
          totalCampaigns: 1,
          totalSent: 1,
          totalDelivered: 1,
          totalOpened: 1,
          totalClicked: 1,
          totalReplied: 1,
          totalBounced: 1,
          totalUnsubscribed: 1,
          avgOpenRate: {
            $cond: [
              { $gt: ['$totalDelivered', 0] },
              { $multiply: [{ $divide: ['$totalOpened', '$totalDelivered'] }, 100] },
              0,
            ],
          },
          avgClickRate: {
            $cond: [
              { $gt: ['$totalDelivered', 0] },
              { $multiply: [{ $divide: ['$totalClicked', '$totalDelivered'] }, 100] },
              0,
            ],
          },
          avgReplyRate: {
            $cond: [
              { $gt: ['$totalDelivered', 0] },
              { $multiply: [{ $divide: ['$totalReplied', '$totalDelivered'] }, 100] },
              0,
            ],
          },
        },
      },
    ]),

    // Campaigns by status
    Campaign.aggregate([
      { $match: { owner: userId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
      { $sort: { count: -1 } },
    ]),

    // Top 5 campaigns by open rate
    Campaign.aggregate([
      {
        $match: {
          owner: userId,
          'stats.sent': { $gt: 0 },
        },
      },
      {
        $addFields: {
          openRate: {
            $cond: [
              { $gt: ['$stats.delivered', 0] },
              { $multiply: [{ $divide: ['$stats.opened', '$stats.delivered'] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: { openRate: -1 } },
      { $limit: 5 },
      {
        $project: {
          name: 1,
          status: 1,
          type: 1,
          stats: 1,
          openRate: { $round: ['$openRate', 1] },
        },
      },
    ]),
  ]);

  const summary = campaignStats[0] || {
    totalCampaigns: 0,
    totalSent: 0,
    totalDelivered: 0,
    totalOpened: 0,
    totalClicked: 0,
    totalReplied: 0,
    avgOpenRate: 0,
    avgClickRate: 0,
    avgReplyRate: 0,
  };

  // Round rates to 1 decimal
  summary.avgOpenRate = Math.round(summary.avgOpenRate * 10) / 10;
  summary.avgClickRate = Math.round(summary.avgClickRate * 10) / 10;
  summary.avgReplyRate = Math.round(summary.avgReplyRate * 10) / 10;

  res.status(200).json({
    success: true,
    data: {
      period: { days: daysNum, startDate },
      summary,
      byStatus,
      topCampaigns,
    },
  });
});

// ─── REVENUE ANALYTICS ────────────────────────────────────────────────────────
exports.getRevenueAnalytics = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { days = 90 } = req.query;
  const daysNum = Math.min(Number(days), 365);
  const startDate = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000);

  const [byStage, closedWonByDate, pipelineSummary, winRate] = await Promise.all([
    // Deal values grouped by stage
    Deal.aggregate([
      { $match: { owner: userId } },
      {
        $group: {
          _id: '$stage',
          count: { $sum: 1 },
          totalValue: { $sum: '$value' },
          avgValue: { $avg: '$value' },
        },
      },
      {
        $project: {
          _id: 0,
          stage: '$_id',
          count: 1,
          totalValue: { $round: ['$totalValue', 2] },
          avgValue: { $round: ['$avgValue', 2] },
        },
      },
      { $sort: { totalValue: -1 } },
    ]),

    // Closed won deals grouped by date (last N days)
    Deal.aggregate([
      {
        $match: {
          owner: userId,
          stage: 'Closed Won',
          updatedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$updatedAt' },
            month: { $month: '$updatedAt' },
            day: { $dayOfMonth: '$updatedAt' },
          },
          count: { $sum: 1 },
          revenue: { $sum: '$value' },
        },
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day',
            },
          },
          count: 1,
          revenue: { $round: ['$revenue', 2] },
        },
      },
      { $sort: { date: 1 } },
    ]),

    // Pipeline summary
    Deal.aggregate([
      { $match: { owner: userId } },
      {
        $group: {
          _id: null,
          totalDeals: { $sum: 1 },
          totalPipelineValue: { $sum: '$value' },
          closedWonValue: {
            $sum: { $cond: [{ $eq: ['$stage', 'Closed Won'] }, '$value', 0] },
          },
          closedLostValue: {
            $sum: { $cond: [{ $eq: ['$stage', 'Closed Lost'] }, '$value', 0] },
          },
          avgDealValue: { $avg: '$value' },
        },
      },
      {
        $project: {
          _id: 0,
          totalDeals: 1,
          totalPipelineValue: { $round: ['$totalPipelineValue', 2] },
          closedWonValue: { $round: ['$closedWonValue', 2] },
          closedLostValue: { $round: ['$closedLostValue', 2] },
          avgDealValue: { $round: ['$avgDealValue', 2] },
        },
      },
    ]),

    // Win rate calculation
    Deal.aggregate([
      {
        $match: {
          owner: userId,
          stage: { $in: ['Closed Won', 'Closed Lost'] },
        },
      },
      {
        $group: {
          _id: null,
          totalClosed: { $sum: 1 },
          won: { $sum: { $cond: [{ $eq: ['$stage', 'Closed Won'] }, 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          totalClosed: 1,
          won: 1,
          winRate: {
            $cond: [
              { $gt: ['$totalClosed', 0] },
              { $multiply: [{ $divide: ['$won', '$totalClosed'] }, 100] },
              0,
            ],
          },
        },
      },
    ]),
  ]);

  const summary = pipelineSummary[0] || {
    totalDeals: 0,
    totalPipelineValue: 0,
    closedWonValue: 0,
    closedLostValue: 0,
    avgDealValue: 0,
  };

  const winRateData = winRate[0] || { totalClosed: 0, won: 0, winRate: 0 };
  winRateData.winRate = Math.round(winRateData.winRate * 10) / 10;

  res.status(200).json({
    success: true,
    data: {
      period: { days: daysNum, startDate },
      summary,
      winRate: winRateData,
      byStage,
      closedWonByDate,
    },
  });
});
