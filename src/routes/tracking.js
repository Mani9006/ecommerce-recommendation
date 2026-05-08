/**
 * Tracking Routes
 * Handles user behavior tracking endpoints
 */

const express = require('express');
const router = express.Router();

/**
 * Setup routes with tracker and abTesting dependencies
 */
function setupTrackingRoutes(tracker, abTesting) {
  
  router.use(express.json());

  /**
   * POST /api/tracking/view
   * Track a product view event
   */
  router.post('/view', (req, res) => {
    try {
      const { userId, productId, category, tags, price } = req.body;

      if (!userId || !productId) {
        return res.status(400).json({
          success: false,
          error: 'userId and productId are required'
        });
      }

      const result = tracker.trackView(userId, productId, { category, tags, price });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to track view',
        message: error.message
      });
    }
  });

  /**
   * POST /api/tracking/purchase
   * Track a purchase event
   */
  router.post('/purchase', (req, res) => {
    try {
      const { userId, productId, quantity, price, experimentId, variantId } = req.body;

      if (!userId || !productId) {
        return res.status(400).json({
          success: false,
          error: 'userId and productId are required'
        });
      }

      const result = tracker.trackPurchase(userId, productId, { quantity, price });

      // Record A/B test event if applicable
      if (experimentId && variantId) {
        abTesting.recordEvent(experimentId, variantId, 'purchase', quantity || 1);
        if (price) {
          abTesting.recordEvent(experimentId, variantId, 'revenue', price * (quantity || 1));
        }
      }

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to track purchase',
        message: error.message
      });
    }
  });

  /**
   * POST /api/tracking/rating
   * Track a rating event
   */
  router.post('/rating', (req, res) => {
    try {
      const { userId, productId, rating, review } = req.body;

      if (!userId || !productId) {
        return res.status(400).json({
          success: false,
          error: 'userId and productId are required'
        });
      }

      if (typeof rating !== 'number' || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          error: 'rating must be a number between 1 and 5'
        });
      }

      const result = tracker.trackRating(userId, productId, rating, { review });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to track rating',
        message: error.message
      });
    }
  });

  /**
   * POST /api/tracking/cart-add
   * Track add-to-cart event
   */
  router.post('/cart-add', (req, res) => {
    try {
      const { userId, productId, price } = req.body;

      if (!userId || !productId) {
        return res.status(400).json({
          success: false,
          error: 'userId and productId are required'
        });
      }

      const result = tracker.trackCartAdd(userId, productId, { price });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to track cart add',
        message: error.message
      });
    }
  });

  /**
   * POST /api/tracking/click
   * Track a recommendation click event
   */
  router.post('/click', (req, res) => {
    try {
      const { userId, productId, recommendationId, position, experimentId, variantId } = req.body;

      if (!userId || !productId) {
        return res.status(400).json({
          success: false,
          error: 'userId and productId are required'
        });
      }

      // Record A/B test click event
      if (experimentId && variantId) {
        abTesting.recordEvent(experimentId, variantId, 'click', 1, {
          productId,
          position
        });
        abTesting.recordEvent(experimentId, variantId, 'engagement', 1);
      }

      // Also record as a view for recommendation purposes
      tracker.trackView(userId, productId);

      res.json({
        success: true,
        data: {
          event: 'click',
          userId,
          productId,
          recommendationId: recommendationId || null,
          position: position || null,
          recordedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to track click',
        message: error.message
      });
    }
  });

  /**
   * GET /api/tracking/user/:userId
   * Get user activity summary
   */
  router.get('/user/:userId', (req, res) => {
    try {
      const { userId } = req.params;
      const summary = tracker.getUserSummary(userId);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get user summary',
        message: error.message
      });
    }
  });

  /**
   * GET /api/tracking/stats
   * Get global tracking statistics
   */
  router.get('/stats', (req, res) => {
    try {
      const stats = tracker.getGlobalStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get stats',
        message: error.message
      });
    }
  });

  /**
   * POST /api/tracking/simulate
   * Simulate user sessions for testing
   */
  router.post('/simulate', (req, res) => {
    try {
      const { count } = req.body;
      const numEvents = Math.min(200, Math.max(1, parseInt(count, 10) || 50));

      // Need access to catalog for simulation - we'll need to pass it through
      res.status(400).json({
        success: false,
        error: 'Use GET /api/recommendations/simulate instead'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Simulation failed',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = setupTrackingRoutes;