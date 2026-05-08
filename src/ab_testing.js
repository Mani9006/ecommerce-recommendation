/**
 * A/B Testing Framework
 * Simulates running experiments on recommendation strategies
 */

class ABTestingFramework {
  constructor() {
    this.experiments = new Map();
    this.userAssignments = new Map(); // userId -> { experimentId, variant }
    this.eventLog = [];
    this.maxEventLogSize = 50000;
  }

  /**
   * Create a new experiment
   */
  createExperiment(config) {
    this.validateExperimentConfig(config);

    const experiment = {
      id: config.id || `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: config.name,
      description: config.description || '',
      startDate: config.startDate || new Date().toISOString(),
      endDate: config.endDate || null,
      status: 'draft', // draft, running, paused, completed
      variants: config.variants.map(v => ({
        id: v.id,
        name: v.name,
        description: v.description || '',
        config: v.config || {},
        trafficAllocation: v.trafficAllocation || (1 / config.variants.length),
        userCount: 0,
        metrics: {
          views: 0,
          clicks: 0,
          purchases: 0,
          revenue: 0,
          engagement: 0
        }
      })),
      targeting: config.targeting || { all: true },
      createdAt: new Date().toISOString()
    };

    // Normalize traffic allocations
    const total = experiment.variants.reduce((sum, v) => sum + v.trafficAllocation, 0);
    if (Math.abs(total - 1) > 0.01) {
      experiment.variants.forEach(v => {
        v.trafficAllocation = 1 / experiment.variants.length;
      });
    }

    this.experiments.set(experiment.id, experiment);
    return experiment;
  }

  /**
   * Assign a user to a variant
   */
  assignUser(userId, experimentId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'running') {
      return null; // No assignment if not running
    }

    // Check if user already assigned
    const userKey = `${userId}:${experimentId}`;
    if (this.userAssignments.has(userKey)) {
      return this.userAssignments.get(userKey);
    }

    // Deterministic assignment using hash
    const hash = this.hashString(`${userId}:${experimentId}`);
    let cumulative = 0;
    let assignedVariant = null;

    for (const variant of experiment.variants) {
      cumulative += variant.trafficAllocation;
      if (hash <= cumulative) {
        assignedVariant = variant;
        break;
      }
    }

    // Fallback to last variant
    if (!assignedVariant) {
      assignedVariant = experiment.variants[experiment.variants.length - 1];
    }

    assignedVariant.userCount++;

    const assignment = {
      userId,
      experimentId,
      variantId: assignedVariant.id,
      variantName: assignedVariant.name,
      assignedAt: new Date().toISOString()
    };

    this.userAssignments.set(userKey, assignment);
    return assignment;
  }

  /**
   * Get variant config for a user
   */
  getUserVariant(userId, experimentId) {
    const userKey = `${userId}:${experimentId}`;
    const assignment = this.userAssignments.get(userKey);
    
    if (assignment) {
      const experiment = this.experiments.get(experimentId);
      const variant = experiment.variants.find(v => v.id === assignment.variantId);
      return {
        variantId: variant.id,
        name: variant.name,
        config: variant.config
      };
    }

    // Try to assign if experiment is running
    return this.assignUser(userId, experimentId);
  }

  /**
   * Record an event for an experiment
   */
  recordEvent(experimentId, variantId, eventType, value = 1, metadata = {}) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return false;

    const variant = experiment.variants.find(v => v.id === variantId);
    if (!variant) return false;

    // Update metrics
    switch (eventType) {
      case 'view':
        variant.metrics.views += value;
        break;
      case 'click':
        variant.metrics.clicks += value;
        break;
      case 'purchase':
        variant.metrics.purchases += value;
        break;
      case 'revenue':
        variant.metrics.revenue += value;
        break;
      case 'engagement':
        variant.metrics.engagement += value;
        break;
      default:
        break;
    }

    // Log event
    this.eventLog.push({
      experimentId,
      variantId,
      eventType,
      value,
      timestamp: Date.now(),
      ...metadata
    });

    if (this.eventLog.length > this.maxEventLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxEventLogSize / 2);
    }

    return true;
  }

  /**
   * Get experiment results
   */
  getResults(experimentId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Calculate totals for baseline (control variant)
    const control = experiment.variants[0];
    const controlCTR = control.metrics.views > 0 
      ? control.metrics.clicks / control.metrics.views 
      : 0;
    const controlConvRate = control.metrics.views > 0
      ? control.metrics.purchases / control.metrics.views
      : 0;

    const results = experiment.variants.map(variant => {
      const views = variant.metrics.views || 1;
      const clicks = variant.metrics.clicks;
      const purchases = variant.metrics.purchases;
      const revenue = variant.metrics.revenue;

      const ctr = views > 0 ? clicks / views : 0;
      const convRate = views > 0 ? purchases / views : 0;
      const rpm = views > 0 ? revenue / views * 1000 : 0; // Revenue per 1000 views

      // Lift vs control
      const ctrLift = controlCTR > 0 ? ((ctr - controlCTR) / controlCTR) * 100 : 0;
      const convLift = controlConvRate > 0 ? ((convRate - controlConvRate) / controlConvRate) * 100 : 0;

      // Calculate statistical significance (simplified)
      const significance = this.calculateSignificance(control, variant);

      return {
        variantId: variant.id,
        variantName: variant.name,
        users: variant.userCount,
        metrics: {
          views,
          clicks,
          purchases,
          revenue: Math.round(revenue * 100) / 100,
          engagement: variant.metrics.engagement
        },
        rates: {
          ctr: Math.round(ctr * 10000) / 10000,
          convRate: Math.round(convRate * 10000) / 10000,
          rpm: Math.round(rpm * 100) / 100
        },
        lift: {
          ctr: Math.round(ctrLift * 100) / 100,
          convRate: Math.round(convLift * 100) / 100
        },
        isSignificant: significance,
        confidence: significance ? 0.95 : 0.5
      };
    });

    return {
      experimentId: experiment.id,
      name: experiment.name,
      status: experiment.status,
      startDate: experiment.startDate,
      endDate: experiment.endDate,
      totalUsers: experiment.variants.reduce((sum, v) => sum + v.userCount, 0),
      results
    };
  }

  /**
   * Start an experiment
   */
  startExperiment(experimentId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }
    if (experiment.status === 'running') {
      return experiment;
    }
    experiment.status = 'running';
    experiment.startDate = new Date().toISOString();
    return experiment;
  }

  /**
   * Pause an experiment
   */
  pauseExperiment(experimentId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }
    experiment.status = 'paused';
    return experiment;
  }

  /**
   * Complete an experiment
   */
  completeExperiment(experimentId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }
    experiment.status = 'completed';
    experiment.endDate = new Date().toISOString();
    return experiment;
  }

  /**
   * Get all experiments
   */
  getExperiments(status = null) {
    let experiments = Array.from(this.experiments.values());
    if (status) {
      experiments = experiments.filter(e => e.status === status);
    }
    return experiments;
  }

  /**
   * Get experiment by ID
   */
  getExperiment(id) {
    return this.experiments.get(id) || null;
  }

  /**
   * Delete an experiment
   */
  deleteExperiment(experimentId) {
    // Clean up user assignments
    for (const [key, assignment] of this.userAssignments.entries()) {
      if (assignment.experimentId === experimentId) {
        this.userAssignments.delete(key);
      }
    }
    return this.experiments.delete(experimentId);
  }

  /**
   * Get dashboard summary
   */
  getDashboard() {
    const experiments = this.getExperiments();
    const totalEvents = this.eventLog.length;
    const activeExperiments = experiments.filter(e => e.status === 'running').length;

    return {
      totalExperiments: experiments.length,
      active: activeExperiments,
      completed: experiments.filter(e => e.status === 'completed').length,
      draft: experiments.filter(e => e.status === 'draft').length,
      paused: experiments.filter(e => e.status === 'paused').length,
      totalUsers: experiments.reduce((sum, e) => 
        sum + e.variants.reduce((vSum, v) => vSum + v.userCount, 0), 0),
      totalEvents,
      recentActivity: this.eventLog.slice(-10).reverse()
    };
  }

  // ---- Simplified Statistical Methods ----

  /**
   * Calculate statistical significance (simplified)
   * Returns true if result appears significant (p < 0.05 approximation)
   */
  calculateSignificance(control, treatment) {
    const cUsers = Math.max(control.userCount, 1);
    const tUsers = Math.max(treatment.userCount, 1);
    
    const cRate = control.metrics.clicks / Math.max(control.metrics.views, 1);
    const tRate = treatment.metrics.clicks / Math.max(treatment.metrics.views, 1);
    
    const pooledP = (control.metrics.clicks + treatment.metrics.clicks) / 
                     Math.max(control.metrics.views + treatment.metrics.views, 1);
    
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1/cUsers + 1/tUsers));
    
    if (se === 0) return false;
    
    const z = (tRate - cRate) / se;
    return Math.abs(z) > 1.96; // Approximate 95% confidence
  }

  /**
   * Deterministic hash for consistent user assignment
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) / 0x7FFFFFFF;
  }

  validateExperimentConfig(config) {
    if (!config.name) {
      throw new Error('Experiment name is required');
    }
    if (!config.variants || config.variants.length < 2) {
      throw new Error('At least 2 variants required');
    }
    
    // Validate variant IDs are unique
    const ids = config.variants.map(v => v.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error('Variant IDs must be unique');
    }

    // Validate traffic allocation
    const total = config.variants.reduce((sum, v) => sum + (v.trafficAllocation || 0), 0);
    if (total > 1.01) {
      throw new Error('Total traffic allocation cannot exceed 1.0');
    }
  }

  // ---- Preset Experiments ----

  /**
   * Create a preset recommendation strategy experiment
   */
  createRecommendationStrategyExperiment() {
    return this.createExperiment({
      name: 'Recommendation Strategy Comparison',
      description: 'Compare collaborative vs content-based vs hybrid recommendation strategies',
      variants: [
        {
          id: 'control',
          name: 'Popularity Baseline',
          description: 'Recommendations based on global popularity',
          config: { strategy: 'popular', weights: { collaborative: 0, contentBased: 0, popularity: 1 } },
          trafficAllocation: 0.25
        },
        {
          id: 'collaborative',
          name: 'Collaborative Filtering',
          description: 'User-user collaborative filtering',
          config: { strategy: 'collaborative', weights: { collaborative: 1, contentBased: 0, popularity: 0 } },
          trafficAllocation: 0.25
        },
        {
          id: 'content-based',
          name: 'Content-Based Filtering',
          description: 'Content-based recommendations',
          config: { strategy: 'content-based', weights: { collaborative: 0, contentBased: 1, popularity: 0 } },
          trafficAllocation: 0.25
        },
        {
          id: 'hybrid',
          name: 'Hybrid Approach',
          description: 'Combined collaborative + content-based + popularity',
          config: { strategy: 'hybrid', weights: { collaborative: 0.4, contentBased: 0.3, popularity: 0.3 } },
          trafficAllocation: 0.25
        }
      ]
    });
  }

  /**
   * Create a preset layout experiment
   */
  createLayoutExperiment() {
    return this.createExperiment({
      name: 'Widget Layout Optimization',
      description: 'Test different widget layouts',
      variants: [
        {
          id: 'grid-4',
          name: '4-Column Grid',
          config: { layout: 'grid', columns: 4, limit: 8 },
          trafficAllocation: 0.5
        },
        {
          id: 'horizontal-scroll',
          name: 'Horizontal Scroll',
          config: { layout: 'carousel', columns: 'auto', limit: 10 },
          trafficAllocation: 0.5
        }
      ]
    });
  }
}

module.exports = ABTestingFramework;