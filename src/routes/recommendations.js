/**
 * Recommendations Routes
 * Handles all recommendation-related API endpoints
 */

const express = require('express');
const router = express.Router();

/**
 * Setup routes with recommender, tracker, catalog, and abTesting dependencies
 */
function setupRecommendationRoutes(recommender, tracker, catalog, abTesting) {
  /**
   * GET /api/recommendations/personalized
   * Get personalized recommendations for a user
   */
  router.get('/personalized', (req, res) => {
    try {
      const { userId, limit, strategy, experimentId } = req.query;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId query parameter is required'
        });
      }

      // A/B test integration
      let effectiveStrategy = strategy || 'hybrid';
      let variantInfo = null;

      if (experimentId) {
        const experiment = abTesting.getExperiment(experimentId);
        if (experiment && experiment.status === 'running') {
          const assignment = abTesting.assignUser(userId, experimentId);
          if (assignment && assignment.config && assignment.config.strategy) {
            effectiveStrategy = assignment.config.strategy;
            variantInfo = {
              variantId: assignment.variantId,
              variantName: assignment.variantName
            };
          }
        }
      }

      const options = {
        limit: Math.min(20, Math.max(1, parseInt(limit, 10) || 8)),
        strategy: effectiveStrategy,
        excludePurchased: true,
        diversify: true
      };

      const result = recommender.getRecommendations(userId, options);

      // Track view event for recommendations
      abTesting.recordEvent(experimentId, variantInfo?.variantId, 'view', 1);

      res.json({
        success: true,
        strategy: effectiveStrategy,
        experiment: variantInfo ? { experimentId, ...variantInfo } : null,
        ...result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get recommendations',
        message: error.message
      });
    }
  });

  /**
   * GET /api/recommendations/also-bought/:productId
   * Get "Customers also bought" recommendations
   */
  router.get('/also-bought/:productId', (req, res) => {
    try {
      const { productId } = req.params;
      const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 6));

      // Validate product exists
      if (!catalog.getProduct(productId)) {
        return res.status(404).json({
          success: false,
          error: `Product not found: ${productId}`
        });
      }

      const result = recommender.getCustomersAlsoBought(productId, { limit });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get "also bought" recommendations',
        message: error.message
      });
    }
  });

  /**
   * GET /api/recommendations/related/:productId
   * Get related products for a product detail page
   */
  router.get('/related/:productId', (req, res) => {
    try {
      const { productId } = req.params;
      const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 6));

      if (!catalog.getProduct(productId)) {
        return res.status(404).json({
          success: false,
          error: `Product not found: ${productId}`
        });
      }

      const result = recommender.getRelatedProducts(productId, { limit });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get related products',
        message: error.message
      });
    }
  });

  /**
   * GET /api/recommendations/trending
   * Get currently trending products
   */
  router.get('/trending', (req, res) => {
    try {
      const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 8));
      const result = recommender.getTrending(limit);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get trending products',
        message: error.message
      });
    }
  });

  /**
   * GET /api/recommendations/popular
   * Get popular products (fallback for new users)
   */
  router.get('/popular', (req, res) => {
    try {
      const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 8));
      const result = recommender.getPopularRecommendations(limit);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get popular products',
        message: error.message
      });
    }
  });

  /**
   * POST /api/recommendations/feedback
   * Submit feedback on recommendation quality
   */
  router.post('/feedback', express.json(), (req, res) => {
    try {
      const { userId, productId, recommendationId, feedback, reason } = req.body;

      if (!userId || !productId || !feedback) {
        return res.status(400).json({
          success: false,
          error: 'userId, productId, and feedback are required'
        });
      }

      // In a real system, store feedback for model improvement
      res.json({
        success: true,
        data: {
          userId,
          productId,
          feedback,
          reason: reason || null,
          recordedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to record feedback',
        message: error.message
      });
    }
  });

  /**
   * GET /api/recommendations/weights
   * Get current recommendation algorithm weights
   */
  router.get('/weights', (req, res) => {
    try {
      res.json({
        success: true,
        data: recommender.getWeights()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get weights',
        message: error.message
      });
    }
  });

  /**
   * POST /api/recommendations/weights
   * Update recommendation algorithm weights (admin only in production)
   */
  router.post('/weights', express.json(), (req, res) => {
    try {
      const { collaborative, contentBased, popularity, diversity } = req.body;
      
      const weights = {};
      if (collaborative !== undefined) weights.collaborative = collaborative;
      if (contentBased !== undefined) weights.contentBased = contentBased;
      if (popularity !== undefined) weights.popularity = popularity;
      if (diversity !== undefined) weights.diversity = diversity;

      const updated = recommender.setWeights(weights);

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to update weights',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = setupRecommendationRoutes;