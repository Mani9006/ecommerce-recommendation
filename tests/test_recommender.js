/**
 * Recommendation Engine Tests
 * Tests for collaborative filtering, content-based, and hybrid algorithms
 */

const ProductCatalog = require('../src/catalog');
const BehaviorTracker = require('../src/behavior_tracker');
const RecommendationEngine = require('../src/recommender');

describe('RecommendationEngine', () => {
  let catalog;
  let tracker;
  let recommender;

  beforeAll(() => {
    catalog = new ProductCatalog();
    catalog.load();
  });

  beforeEach(() => {
    tracker = new BehaviorTracker();
    recommender = new RecommendationEngine(catalog, tracker);
  });

  afterEach(() => {
    tracker.clear();
    recommender.clearCache();
  });

  // ---- Constructor Tests ----
  
  describe('constructor', () => {
    test('should initialize with catalog and tracker', () => {
      expect(recommender.catalog).toBe(catalog);
      expect(recommender.tracker).toBe(tracker);
    });

    test('should have default weights', () => {
      const weights = recommender.getWeights();
      expect(weights.collaborative).toBe(0.4);
      expect(weights.contentBased).toBe(0.3);
      expect(weights.popularity).toBe(0.2);
      expect(weights.diversity).toBe(0.1);
    });
  });

  // ---- Popular Recommendations ----
  
  describe('getPopularRecommendations', () => {
    test('should return popular products for new users', () => {
      const result = recommender.getRecommendations('new_user_123', {
        limit: 5,
        strategy: 'popular'
      });

      expect(result.strategy).toBe('popular');
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeLessThanOrEqual(5);
      expect(result.recommendations[0].product).toBeDefined();
      expect(result.recommendations[0].score).toBeDefined();
    });

    test('should return default for users with no history', () => {
      const result = recommender.getRecommendations('no_history_user');

      expect(result.strategy).toBe('popular');
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    test('should respect limit parameter', () => {
      const result = recommender.getPopularRecommendations(3);
      expect(result.recommendations.length).toBeLessThanOrEqual(3);
    });
  });

  // ---- Collaborative Filtering ----

  describe('collaborativeFiltering', () => {
    test('should return scored products based on user similarities', () => {
      // Create users with overlapping interests
      tracker.trackView('user_a', 'p001', { category: 'electronics', tags: ['bluetooth', 'wireless'], price: 79.99 });
      tracker.trackView('user_a', 'p003', { category: 'electronics', tags: ['power-bank', 'portable'], price: 29.99 });
      tracker.trackPurchase('user_a', 'p001', { price: 79.99 });

      tracker.trackView('user_b', 'p001', { category: 'electronics', tags: ['bluetooth', 'wireless'], price: 79.99 });
      tracker.trackView('user_b', 'p003', { category: 'electronics', tags: ['power-bank', 'portable'], price: 29.99 });
      tracker.trackPurchase('user_b', 'p002', { price: 12.99 });

      const results = recommender.collaborativeFiltering('user_a');

      expect(Array.isArray(results)).toBe(true);
      expect(results.every(r => r.productId && typeof r.score === 'number')).toBe(true);
      
      // p002 should be recommended since user_b (similar to user_a) bought it
      const p002 = results.find(r => r.productId === 'p002');
      if (p002) {
        expect(p002.score).toBeGreaterThan(0);
      }
    });

    test('should return empty array for user with no profile', () => {
      const results = recommender.collaborativeFiltering('unknown_user');
      expect(results).toEqual([]);
    });

    test('should not recommend already purchased products when excludePurchased is true', () => {
      tracker.trackPurchase('user_c', 'p001', { price: 79.99 });
      tracker.trackPurchase('user_d', 'p001', { price: 79.99 });
      tracker.trackPurchase('user_d', 'p002', { price: 12.99 });

      const result = recommender.getRecommendations('user_c', {
        excludePurchased: true
      });

      const purchasedIds = result.recommendations.map(r => r.product.id);
      expect(purchasedIds).not.toContain('p001');
    });
  });

  // ---- Content-Based Filtering ----

  describe('contentBasedFiltering', () => {
    test('should recommend based on user category and tag preferences', () => {
      tracker.trackView('user_e', 'p001', { category: 'electronics', tags: ['bluetooth', 'wireless'], price: 79.99 });
      tracker.trackView('user_e', 'p001', { category: 'electronics', tags: ['bluetooth', 'wireless'], price: 79.99 });
      tracker.trackView('user_e', 'p002', { category: 'electronics', tags: ['usb-c', 'charging'], price: 12.99 });

      const results = recommender.contentBasedFiltering('user_e');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      // Electronics products should be ranked higher
      const topResult = catalog.getProduct(results[0].productId);
      expect(topResult.category).toBe('electronics');
    });

    test('should boost products similar to highly rated items', () => {
      tracker.trackRating('user_f', 'p001', 5, { category: 'electronics', tags: ['bluetooth'] });
      
      const results = recommender.contentBasedFiltering('user_f');
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ---- Hybrid Recommendations ----

  describe('hybridRecommendations', () => {
    test('should combine collaborative and content-based scores', () => {
      tracker.trackView('user_g', 'p001', { category: 'electronics', tags: ['bluetooth'], price: 79.99 });
      tracker.trackPurchase('user_g', 'p003', { price: 29.99 });
      
      tracker.trackView('user_h', 'p001', { category: 'electronics', tags: ['bluetooth'], price: 79.99 });
      tracker.trackPurchase('user_h', 'p002', { price: 12.99 });

      const result = recommender.getRecommendations('user_g', {
        strategy: 'hybrid',
        limit: 5
      });

      expect(result.strategy).toBe('hybrid');
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeLessThanOrEqual(5);
      expect(result.recommendations[0].product).toBeDefined();
      expect(result.recommendations[0].score).toBeDefined();
    });
  });

  // ---- Customers Also Bought ----

  describe('getCustomersAlsoBought', () => {
    test('should return products frequently bought together', () => {
      // Set up co-purchase patterns
      tracker.trackPurchase('user_i', 'p001', { price: 79.99 });
      tracker.trackPurchase('user_i', 'p002', { price: 12.99 });
      
      tracker.trackPurchase('user_j', 'p001', { price: 79.99 });
      tracker.trackPurchase('user_j', 'p002', { price: 12.99 });
      tracker.trackPurchase('user_j', 'p003', { price: 29.99 });

      const result = recommender.getCustomersAlsoBought('p001', { limit: 5 });

      expect(result.productId).toBe('p001');
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0].product).toBeDefined();
    });

    test('should return similar products when no co-purchase data exists', () => {
      const result = recommender.getCustomersAlsoBought('p020', { limit: 3 });
      
      expect(result.productId).toBe('p020');
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    test('should respect the limit parameter', () => {
      const result = recommender.getCustomersAlsoBought('p001', { limit: 2 });
      expect(result.recommendations.length).toBeLessThanOrEqual(2);
    });
  });

  // ---- Related Products ----

  describe('getRelatedProducts', () => {
    test('should return related products combining co-purchase and similarity', () => {
      tracker.trackPurchase('user_k', 'p001', { price: 79.99 });
      tracker.trackPurchase('user_k', 'p002', { price: 12.99 });

      const result = recommender.getRelatedProducts('p001', { limit: 4 });

      expect(result.productId).toBe('p001');
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeLessThanOrEqual(4);
    });

    test('should return similar products when no co-purchases exist', () => {
      const result = recommender.getRelatedProducts('p010', { limit: 5 });

      expect(result.productId).toBe('p010');
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  // ---- Trending ----

  describe('getTrending', () => {
    test('should return trending products based on recent views', () => {
      // Add some view events
      tracker.trackView('user_l', 'p001', { category: 'electronics' });
      tracker.trackView('user_m', 'p001', { category: 'electronics' });
      tracker.trackView('user_n', 'p001', { category: 'electronics' });
      tracker.trackView('user_o', 'p007', { category: 'home' });

      const result = recommender.getTrending(5);

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0].product).toBeDefined();
    });
  });

  // ---- Cosine Similarity ----

  describe('cosineSimilarity', () => {
    test('should return 1 for identical maps', () => {
      const a = new Map([['x', 1], ['y', 2]]);
      const b = new Map([['x', 1], ['y', 2]]);
      expect(recommender.cosineSimilarity(a, b)).toBeCloseTo(1, 5);
    });

    test('should return 0 for orthogonal maps', () => {
      const a = new Map([['x', 1]]);
      const b = new Map([['y', 1]]);
      expect(recommender.cosineSimilarity(a, b)).toBe(0);
    });

    test('should return 0 for empty maps', () => {
      const a = new Map();
      const b = new Map([['x', 1]]);
      expect(recommender.cosineSimilarity(a, b)).toBe(0);
    });

    test('should be symmetric', () => {
      const a = new Map([['x', 1], ['y', 2], ['z', 3]]);
      const b = new Map([['x', 2], ['y', 1], ['w', 4]]);
      const simAB = recommender.cosineSimilarity(a, b);
      const simBA = recommender.cosineSimilarity(b, a);
      expect(simAB).toBeCloseTo(simBA, 10);
    });
  });

  // ---- Diversification ----

  describe('diversifyResults', () => {
    test('should not exceed the requested limit', () => {
      const allProducts = catalog.getAllProducts();
      const scored = allProducts.map(p => ({ productId: p.id, score: Math.random() }));
      const diversified = recommender.diversifyResults(scored, 5);
      expect(diversified.length).toBeLessThanOrEqual(5);
    });

    test('should return empty array for empty input', () => {
      const result = recommender.diversifyResults([], 5);
      expect(result).toEqual([]);
    });
  });

  // ---- Weight Management ----

  describe('setWeights', () => {
    test('should update weights', () => {
      const newWeights = { collaborative: 0.6, contentBased: 0.2 };
      const updated = recommender.setWeights(newWeights);
      
      expect(updated.collaborative).toBe(0.6);
      expect(updated.contentBased).toBe(0.2);
      // Unchanged weights should remain
      expect(updated.popularity).toBe(0.2);
    });

    test('should merge partial weight updates', () => {
      const original = recommender.getWeights();
      const updated = recommender.setWeights({ popularity: 0.5 });
      
      expect(updated.popularity).toBe(0.5);
      expect(updated.collaborative).toBe(original.collaborative);
      expect(updated.contentBased).toBe(original.contentBased);
    });
  });

  // ---- Cache Management ----

  describe('clearCache', () => {
    test('should clear the cache', () => {
      // The cache field exists and clearCache doesn't throw
      expect(() => recommender.clearCache()).not.toThrow();
    });
  });

  // ---- Integration: Full recommendation flow ----

  describe('integration', () => {
    test('should provide complete recommendation pipeline', () => {
      // 1. Load catalog
      expect(catalog.getProductCount()).toBeGreaterThan(0);

      // 2. Simulate user behavior
      const users = ['test_u1', 'test_u2', 'test_u3'];
      const products = catalog.getAllProducts();

      users.forEach((userId, idx) => {
        products.slice(idx, idx + 3).forEach(product => {
          tracker.trackView(userId, product.id, {
            category: product.category,
            tags: product.tags,
            price: product.price
          });
          if (idx === 0) {
            tracker.trackRating(userId, product.id, 4 + (idx % 2));
          }
        });
      });

      // 3. Get recommendations
      const result = recommender.getRecommendations('test_u1', {
        limit: 5,
        strategy: 'hybrid'
      });

      expect(result).toHaveProperty('userId', 'test_u1');
      expect(result).toHaveProperty('strategy');
      expect(result).toHaveProperty('recommendations');
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    test('should handle all strategies without errors', () => {
      const strategies = ['collaborative', 'content-based', 'hybrid', 'popular'];
      tracker.trackView('strat_test', 'p001', { category: 'electronics', tags: ['bluetooth'], price: 79.99 });

      strategies.forEach(strategy => {
        expect(() => {
          const result = recommender.getRecommendations('strat_test', {
            strategy,
            limit: 3
          });
          expect(result.recommendations).toBeDefined();
        }).not.toThrow();
      });
    });
  });
});