/**
 * Product Routes
 * Handles product catalog API endpoints
 */

const express = require('express');
const router = express.Router();

/**
 * Setup routes with catalog dependency
 */
function setupProductRoutes(catalog) {
  /**
   * GET /api/products
   * List products with pagination, filtering, and sorting
   */
  router.get('/', (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
      const sortBy = req.query.sortBy || 'popularity';
      const order = req.query.order === 'asc' ? 'asc' : 'desc';
      const category = req.query.category || null;
      const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
      const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;
      const minRating = req.query.minRating ? parseFloat(req.query.minRating) : null;

      const result = catalog.getPaginated({
        page,
        limit,
        sortBy,
        order,
        category,
        minPrice,
        maxPrice,
        minRating
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve products',
        message: error.message
      });
    }
  });

  /**
   * GET /api/products/search
   * Search products by name, tags, or category
   */
  router.get('/search', (req, res) => {
    try {
      const { q } = req.query;
      
      if (!q || q.trim().length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Search query must be at least 2 characters'
        });
      }

      const results = catalog.search(q.trim());

      res.json({
        success: true,
        query: q.trim(),
        count: results.length,
        data: results
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Search failed',
        message: error.message
      });
    }
  });

  /**
   * GET /api/products/categories
   * Get all product categories with stats
   */
  router.get('/categories', (req, res) => {
    try {
      const categories = catalog.getCategories();
      const stats = catalog.getCategoryStats();

      res.json({
        success: true,
        data: {
          categories,
          stats
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve categories',
        message: error.message
      });
    }
  });

  /**
   * GET /api/products/price-range
   * Get price range statistics
   */
  router.get('/price-range', (req, res) => {
    try {
      const range = catalog.getPriceRange();

      res.json({
        success: true,
        data: range
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve price range',
        message: error.message
      });
    }
  });

  /**
   * GET /api/products/popular
   * Get popular products
   */
  router.get('/popular', (req, res) => {
    try {
      const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const popular = catalog.getPopular(limit);

      res.json({
        success: true,
        count: popular.length,
        data: popular
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve popular products',
        message: error.message
      });
    }
  });

  /**
   * GET /api/products/:id
   * Get single product by ID
   */
  router.get('/:id', (req, res) => {
    try {
      const product = catalog.getProduct(req.params.id);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: `Product not found: ${req.params.id}`
        });
      }

      res.json({
        success: true,
        data: product
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve product',
        message: error.message
      });
    }
  });

  /**
   * GET /api/products/:id/similar
   * Get similar products
   */
  router.get('/:id/similar', (req, res) => {
    try {
      const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));
      const similar = catalog.getSimilar(req.params.id, limit);

      res.json({
        success: true,
        productId: req.params.id,
        count: similar.length,
        data: similar
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve similar products',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = setupProductRoutes;