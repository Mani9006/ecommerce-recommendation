/**
 * A/B Testing Framework Tests
 * Tests for experiment management, user assignment, and results
 */

const ABTestingFramework = require('../src/ab_testing');

describe('ABTestingFramework', () => {
  let ab;

  beforeEach(() => {
    ab = new ABTestingFramework();
  });

  // ---- Constructor ----

  describe('constructor', () => {
    test('should initialize with empty state', () => {
      expect(ab.experiments.size).toBe(0);
      expect(ab.userAssignments.size).toBe(0);
      expect(ab.eventLog).toEqual([]);
    });
  });

  // ---- Create Experiment ----

  describe('createExperiment', () => {
    test('should create experiment with valid config', () => {
      const experiment = ab.createExperiment({
        name: 'Test Experiment',
        variants: [
          { id: 'control', name: 'Control' },
          { id: 'variant_a', name: 'Variant A' }
        ]
      });

      expect(experiment).toBeDefined();
      expect(experiment.id).toBeDefined();
      expect(experiment.name).toBe('Test Experiment');
      expect(experiment.status).toBe('draft');
      expect(experiment.variants).toHaveLength(2);
    });

    test('should auto-generate ID if not provided', () => {
      const experiment = ab.createExperiment({
        name: 'Auto ID Test',
        variants: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      });

      expect(experiment.id).toBeTruthy();
      expect(experiment.id.startsWith('exp_')).toBe(true);
    });

    test('should accept provided ID', () => {
      const experiment = ab.createExperiment({
        id: 'my_custom_id',
        name: 'Custom ID Test',
        variants: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      });

      expect(experiment.id).toBe('my_custom_id');
    });

    test('should throw for missing name', () => {
      expect(() => {
        ab.createExperiment({
          variants: [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' }
          ]
        });
      }).toThrow('Experiment name is required');
    });

    test('should throw for single variant', () => {
      expect(() => {
        ab.createExperiment({
          name: 'Bad Experiment',
          variants: [{ id: 'only', name: 'Only' }]
        });
      }).toThrow('At least 2 variants required');
    });

    test('should throw for duplicate variant IDs', () => {
      expect(() => {
        ab.createExperiment({
          name: 'Dup Experiment',
          variants: [
            { id: 'same', name: 'A' },
            { id: 'same', name: 'B' }
          ]
        });
      }).toThrow('Variant IDs must be unique');
    });

    test('should throw for traffic allocation exceeding 1.0', () => {
      expect(() => {
        ab.createExperiment({
          name: 'Bad Allocation',
          variants: [
            { id: 'a', name: 'A', trafficAllocation: 0.8 },
            { id: 'b', name: 'B', trafficAllocation: 0.8 }
          ]
        });
      }).toThrow('Total traffic allocation cannot exceed 1.0');
    });

    test('should store experiment', () => {
      const experiment = ab.createExperiment({
        name: 'Storage Test',
        variants: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      });

      expect(ab.experiments.has(experiment.id)).toBe(true);
    });

    test('should normalize traffic allocations', () => {
      const experiment = ab.createExperiment({
        name: 'Normalization Test',
        variants: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      });

      const total = experiment.variants.reduce((sum, v) => sum + v.trafficAllocation, 0);
      expect(total).toBeCloseTo(1, 1);
    });
  });

  // ---- User Assignment ----

  describe('assignUser', () => {
    let experimentId;

    beforeEach(() => {
      const exp = ab.createExperiment({
        name: 'Assignment Test',
        variants: [
          { id: 'control', name: 'Control', trafficAllocation: 0.5 },
          { id: 'variant_a', name: 'Variant A', trafficAllocation: 0.5 }
        ]
      });
      experimentId = exp.id;
    });

    test('should not assign when experiment is draft', () => {
      const assignment = ab.assignUser('user_1', experimentId);
      expect(assignment).toBeNull();
    });

    test('should assign user when experiment is running', () => {
      ab.startExperiment(experimentId);
      const assignment = ab.assignUser('user_1', experimentId);

      expect(assignment).toBeDefined();
      expect(assignment.userId).toBe('user_1');
      expect(assignment.experimentId).toBe(experimentId);
      expect(assignment.variantId).toBeDefined();
    });

    test('should assign to one of the variants', () => {
      ab.startExperiment(experimentId);
      const assignment = ab.assignUser('user_1', experimentId);
      const variantIds = ['control', 'variant_a'];
      expect(variantIds).toContain(assignment.variantId);
    });

    test('should be deterministic (same user gets same variant)', () => {
      ab.startExperiment(experimentId);
      const assignment1 = ab.assignUser('user_1', experimentId);
      const assignment2 = ab.assignUser('user_1', experimentId);

      expect(assignment1.variantId).toBe(assignment2.variantId);
    });

    test('should increment user count for assigned variant', () => {
      ab.startExperiment(experimentId);
      ab.assignUser('user_1', experimentId);
      
      const experiment = ab.getExperiment(experimentId);
      const totalUsers = experiment.variants.reduce((sum, v) => sum + v.userCount, 0);
      expect(totalUsers).toBe(1);
    });

    test('should throw for non-existent experiment', () => {
      expect(() => {
        ab.assignUser('user_1', 'nonexistent');
      }).toThrow('not found');
    });

    test('should distribute users across variants over many assignments', () => {
      ab.startExperiment(experimentId);
      
      for (let i = 0; i < 100; i++) {
        ab.assignUser(`user_${i}`, experimentId);
      }

      const experiment = ab.getExperiment(experimentId);
      const control = experiment.variants.find(v => v.id === 'control');
      const variant = experiment.variants.find(v => v.id === 'variant_a');

      // With 50/50 split, both should have users
      expect(control.userCount).toBeGreaterThan(0);
      expect(variant.userCount).toBeGreaterThan(0);
      expect(control.userCount + variant.userCount).toBe(100);
    });
  });

  // ---- Get User Variant ----

  describe('getUserVariant', () => {
    let experimentId;

    beforeEach(() => {
      const exp = ab.createExperiment({
        name: 'Get Variant Test',
        variants: [
          { id: 'control', name: 'Control' },
          { id: 'variant_a', name: 'Variant A' }
        ]
      });
      experimentId = exp.id;
      ab.startExperiment(experimentId);
    });

    test('should return variant for user', () => {
      const variant = ab.getUserVariant('user_test', experimentId);
      expect(variant).toBeDefined();
      expect(variant.variantId).toBeDefined();
    });

    test('should return consistent variant for same user', () => {
      const v1 = ab.getUserVariant('consistent_user', experimentId);
      const v2 = ab.getUserVariant('consistent_user', experimentId);
      expect(v1.variantId).toBe(v2.variantId);
    });
  });

  // ---- Event Recording ----

  describe('recordEvent', () => {
    let experimentId;

    beforeEach(() => {
      const exp = ab.createExperiment({
        name: 'Event Test',
        variants: [
          { id: 'control', name: 'Control' },
          { id: 'variant_a', name: 'Variant A' }
        ]
      });
      experimentId = exp.id;
    });

    test('should record view events', () => {
      const result = ab.recordEvent(experimentId, 'control', 'view', 1);
      expect(result).toBe(true);

      const experiment = ab.getExperiment(experimentId);
      const control = experiment.variants.find(v => v.id === 'control');
      expect(control.metrics.views).toBe(1);
    });

    test('should record click events', () => {
      ab.recordEvent(experimentId, 'control', 'view', 10);
      ab.recordEvent(experimentId, 'control', 'click', 5);

      const experiment = ab.getExperiment(experimentId);
      const control = experiment.variants.find(v => v.id === 'control');
      expect(control.metrics.clicks).toBe(5);
    });

    test('should record purchase events', () => {
      ab.recordEvent(experimentId, 'control', 'purchase', 3);

      const experiment = ab.getExperiment(experimentId);
      const control = experiment.variants.find(v => v.id === 'control');
      expect(control.metrics.purchases).toBe(3);
    });

    test('should record revenue events', () => {
      ab.recordEvent(experimentId, 'control', 'revenue', 199.99);

      const experiment = ab.getExperiment(experimentId);
      const control = experiment.variants.find(v => v.id === 'control');
      expect(control.metrics.revenue).toBe(199.99);
    });

    test('should return false for non-existent experiment', () => {
      const result = ab.recordEvent('nonexistent', 'control', 'view');
      expect(result).toBe(false);
    });

    test('should return false for non-existent variant', () => {
      const result = ab.recordEvent(experimentId, 'nonexistent', 'view');
      expect(result).toBe(false);
    });

    test('should add events to event log', () => {
      ab.recordEvent(experimentId, 'control', 'view', 1, { productId: 'p001' });
      expect(ab.eventLog.length).toBeGreaterThan(0);
    });
  });

  // ---- Experiment Lifecycle ----

  describe('startExperiment', () => {
    test('should set status to running', () => {
      const exp = ab.createExperiment({
        name: 'Lifecycle Test',
        variants: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      });

      const started = ab.startExperiment(exp.id);
      expect(started.status).toBe('running');
    });

    test('should throw for non-existent experiment', () => {
      expect(() => ab.startExperiment('nonexistent')).toThrow('not found');
    });
  });

  describe('pauseExperiment', () => {
    test('should set status to paused', () => {
      const exp = ab.createExperiment({
        name: 'Pause Test',
        variants: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      });

      ab.startExperiment(exp.id);
      const paused = ab.pauseExperiment(exp.id);
      expect(paused.status).toBe('paused');
    });

    test('should throw for non-existent experiment', () => {
      expect(() => ab.pauseExperiment('nonexistent')).toThrow('not found');
    });
  });

  describe('completeExperiment', () => {
    test('should set status to completed and set end date', () => {
      const exp = ab.createExperiment({
        name: 'Complete Test',
        variants: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      });

      ab.startExperiment(exp.id);
      const completed = ab.completeExperiment(exp.id);
      expect(completed.status).toBe('completed');
      expect(completed.endDate).toBeTruthy();
    });

    test('should throw for non-existent experiment', () => {
      expect(() => ab.completeExperiment('nonexistent')).toThrow('not found');
    });
  });

  // ---- Results ----

  describe('getResults', () => {
    beforeEach(() => {
      const exp = ab.createExperiment({
        name: 'Results Test',
        variants: [
          { id: 'control', name: 'Control' },
          { id: 'variant_a', name: 'Variant A' }
        ]
      });
      
      // Seed some events
      ab.recordEvent(exp.id, 'control', 'view', 100);
      ab.recordEvent(exp.id, 'control', 'click', 10);
      ab.recordEvent(exp.id, 'control', 'purchase', 5);
      ab.recordEvent(exp.id, 'control', 'revenue', 499.95);

      ab.recordEvent(exp.id, 'variant_a', 'view', 100);
      ab.recordEvent(exp.id, 'variant_a', 'click', 20);
      ab.recordEvent(exp.id, 'variant_a', 'purchase', 10);
      ab.recordEvent(exp.id, 'variant_a', 'revenue', 999.90);
    });

    test('should throw for non-existent experiment', () => {
      expect(() => ab.getResults('nonexistent')).toThrow('not found');
    });
  });

  // ---- Get Experiments ----

  describe('getExperiments', () => {
    test('should return all experiments', () => {
      ab.createExperiment({
        name: 'Exp 1',
        variants: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      });
      ab.createExperiment({
        name: 'Exp 2',
        variants: [
          { id: 'x', name: 'X' },
          { id: 'y', name: 'Y' }
        ]
      });

      const all = ab.getExperiments();
      expect(all).toHaveLength(2);
    });

    test('should filter by status', () => {
      const exp = ab.createExperiment({
        name: 'Filter Test',
        variants: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      });
      ab.startExperiment(exp.id);

      const running = ab.getExperiments('running');
      expect(running).toHaveLength(1);

      const draft = ab.getExperiments('draft');
      expect(draft).toHaveLength(0);
    });
  });

  describe('getExperiment', () => {
    test('should return experiment by ID', () => {
      const created = ab.createExperiment({
        name: 'Get Test',
        variants: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      });

      const found = ab.getExperiment(created.id);
      expect(found).toBeDefined();
      expect(found.name).toBe('Get Test');
    });

    test('should return null for non-existent ID', () => {
      const result = ab.getExperiment('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ---- Delete ----

  describe('deleteExperiment', () => {
    test('should remove experiment', () => {
      const exp = ab.createExperiment({
        name: 'Delete Test',
        variants: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      });

      expect(ab.deleteExperiment(exp.id)).toBe(true);
      expect(ab.getExperiment(exp.id)).toBeNull();
    });

    test('should remove associated user assignments', () => {
      const exp = ab.createExperiment({
        name: 'Delete Assignment Test',
        variants: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      });
      ab.startExperiment(exp.id);
      ab.assignUser('user_to_clean', exp.id);

      // Verify assignment exists
      expect(ab.userAssignments.has(`user_to_clean:${exp.id}`)).toBe(true);

      ab.deleteExperiment(exp.id);

      // Verify assignment is cleaned up
      expect(ab.userAssignments.has(`user_to_clean:${exp.id}`)).toBe(false);
    });

    test('should return false for non-existent experiment', () => {
      expect(ab.deleteExperiment('nonexistent')).toBe(false);
    });
  });

  // ---- Dashboard ----

  describe('getDashboard', () => {
    test('should return summary statistics', () => {
      ab.createExperiment({
        name: 'Dash 1',
        variants: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      });
      ab.createExperiment({
        name: 'Dash 2',
        variants: [
          { id: 'x', name: 'X' },
          { id: 'y', name: 'Y' }
        ]
      });

      const dashboard = ab.getDashboard();
      expect(dashboard).toHaveProperty('totalExperiments', 2);
      expect(dashboard).toHaveProperty('active');
      expect(dashboard).toHaveProperty('completed');
      expect(dashboard).toHaveProperty('totalUsers');
      expect(dashboard).toHaveProperty('totalEvents');
      expect(dashboard).toHaveProperty('recentActivity');
    });
  });

  // ---- Preset Experiments ----

  describe('createRecommendationStrategyExperiment', () => {
    test('should create preset recommendation experiment', () => {
      const exp = ab.createRecommendationStrategyExperiment();
      
      expect(exp.name).toContain('Recommendation Strategy');
      expect(exp.variants).toHaveLength(4);
      expect(exp.variants.some(v => v.id === 'control')).toBe(true);
      expect(exp.variants.some(v => v.id === 'collaborative')).toBe(true);
      expect(exp.variants.some(v => v.id === 'content-based')).toBe(true);
      expect(exp.variants.some(v => v.id === 'hybrid')).toBe(true);
      
      // Check configs
      const hybrid = exp.variants.find(v => v.id === 'hybrid');
      expect(hybrid.config.strategy).toBe('hybrid');
    });
  });

  describe('createLayoutExperiment', () => {
    test('should create preset layout experiment', () => {
      const exp = ab.createLayoutExperiment();
      
      expect(exp.name).toContain('Layout');
      expect(exp.variants).toHaveLength(2);
      expect(exp.variants.some(v => v.id === 'grid-4')).toBe(true);
      expect(exp.variants.some(v => v.id === 'horizontal-scroll')).toBe(true);
    });
  });

  // ---- Hash Function ----

  describe('hashString', () => {
    test('should return consistent hash for same input', () => {
      const h1 = ab.hashString('test_string');
      const h2 = ab.hashString('test_string');
      expect(h1).toBe(h2);
    });

    test('should return different hashes for different inputs', () => {
      const h1 = ab.hashString('string_a');
      const h2 = ab.hashString('string_b');
      // Very unlikely to be equal for different strings
      expect(h1).not.toBe(h2);
    });

    test('should return value between 0 and 1', () => {
      const hash = ab.hashString('anything');
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(1);
    });
  });

  // ---- Event Log Management ----

  describe('event log', () => {
    test('should limit event log size', () => {
      const exp = ab.createExperiment({
        name: 'Log Size Test',
        variants: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      });

      // Add many events
      for (let i = 0; i < 55000; i++) {
        ab.recordEvent(exp.id, 'a', 'view');
      }

      expect(ab.eventLog.length).toBeLessThanOrEqual(50000);
    });
  });

  // ---- Validation ----

  describe('validateExperimentConfig', () => {
    test('should not throw for valid config', () => {
      expect(() => {
        ab.validateExperimentConfig({
          name: 'Valid',
          variants: [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' }
          ]
        });
      }).not.toThrow();
    });

    test('should throw for missing name', () => {
      expect(() => {
        ab.validateExperimentConfig({
          variants: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
        });
      }).toThrow('name is required');
    });

    test('should throw for single variant', () => {
      expect(() => {
        ab.validateExperimentConfig({
          name: 'Bad',
          variants: [{ id: 'a', name: 'A' }]
        });
      }).toThrow('At least 2 variants');
    });
  });
});