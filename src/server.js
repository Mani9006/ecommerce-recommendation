/**
 * E-Commerce Recommendation Widget Server
 * Express application with recommendation API
 */

const express = require('express');
const path = require('path');
const cors = require('cors');

const ProductCatalog = require('./catalog');
const BehaviorTracker = require('./behavior_tracker');
const RecommendationEngine = require('./recommender');
const ABTestingFramework = require('./ab_testing');

const setupProductRoutes = require('./routes/products');
const setupRecommendationRoutes = require('./routes/recommendations');
const setupTrackingRoutes = require('./routes/tracking');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// ---- Initialize Services ----

const catalog = new ProductCatalog();
const tracker = new BehaviorTracker();
const recommender = new RecommendationEngine(catalog, tracker);
const abTesting = new ABTestingFramework();

// ---- Setup Routes ----

const productRoutes = setupProductRoutes(catalog);
const recommendationRoutes = setupRecommendationRoutes(recommender, tracker, catalog, abTesting);
const trackingRoutes = setupTrackingRoutes(tracker, abTesting);

app.use('/api/products', productRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/tracking', trackingRoutes);

// ---- A/B Testing Routes ----

/**
 * GET /api/experiments
 * List all experiments
 */
app.get('/api/experiments', (req, res) => {
  try {
    const { status } = req.query;
    const experiments = abTesting.getExperiments(status);

    res.json({
      success: true,
      count: experiments.length,
      data: experiments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to list experiments',
      message: error.message
    });
  }
});

/**
 * POST /api/experiments
 * Create a new experiment
 */
app.post('/api/experiments', (req, res) => {
  try {
    const experiment = abTesting.createExperiment(req.body);

    res.status(201).json({
      success: true,
      data: experiment
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Failed to create experiment',
      message: error.message
    });
  }
});

/**
 * GET /api/experiments/:id
 * Get experiment details
 */
app.get('/api/experiments/:id', (req, res) => {
  try {
    const experiment = abTesting.getExperiment(req.params.id);
    if (!experiment) {
      return res.status(404).json({
        success: false,
        error: `Experiment not found: ${req.params.id}`
      });
    }

    res.json({
      success: true,
      data: experiment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get experiment',
      message: error.message
    });
  }
});

/**
 * POST /api/experiments/:id/start
 * Start an experiment
 */
app.post('/api/experiments/:id/start', (req, res) => {
  try {
    const experiment = abTesting.startExperiment(req.params.id);

    res.json({
      success: true,
      data: experiment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to start experiment',
      message: error.message
    });
  }
});

/**
 * POST /api/experiments/:id/pause
 * Pause an experiment
 */
app.post('/api/experiments/:id/pause', (req, res) => {
  try {
    const experiment = abTesting.pauseExperiment(req.params.id);

    res.json({
      success: true,
      data: experiment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to pause experiment',
      message: error.message
    });
  }
});

/**
 * POST /api/experiments/:id/complete
 * Complete an experiment
 */
app.post('/api/experiments/:id/complete', (req, res) => {
  try {
    const experiment = abTesting.completeExperiment(req.params.id);

    res.json({
      success: true,
      data: experiment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to complete experiment',
      message: error.message
    });
  }
});

/**
 * GET /api/experiments/:id/results
 * Get experiment results
 */
app.get('/api/experiments/:id/results', (req, res) => {
  try {
    const results = abTesting.getResults(req.params.id);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get experiment results',
      message: error.message
    });
  }
});

/**
 * POST /api/experiments/:id/event
 * Record an event for an experiment
 */
app.post('/api/experiments/:id/event', (req, res) => {
  try {
    const { variantId, eventType, value, metadata } = req.body;

    if (!variantId || !eventType) {
      return res.status(400).json({
        success: false,
        error: 'variantId and eventType are required'
      });
    }

    const result = abTesting.recordEvent(req.params.id, variantId, eventType, value || 1, metadata || {});

    res.json({
      success: true,
      data: { recorded: result }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to record event',
      message: error.message
    });
  }
});

/**
 * GET /api/dashboard
 * Get A/B testing dashboard data
 */
app.get('/api/dashboard', (req, res) => {
  try {
    const dashboard = abTesting.getDashboard();

    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard',
      message: error.message
    });
  }
});

// ---- Widget Serving Routes ----

/**
 * Serve the widget HTML page
 */
app.get('/widget', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'widget.html'));
});

/**
 * Simulate data endpoint - generates test data
 */
app.post('/api/simulate', (req, res) => {
  try {
    const { count = 50 } = req.body;
    const numEvents = Math.min(200, Math.max(1, parseInt(count, 10)));
    
    const result = tracker.simulateUserSessions(numEvents, catalog);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Simulation failed',
      message: error.message
    });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      catalog: catalog.loaded ? 'loaded' : 'not-loaded',
      products: catalog.getProductCount(),
      users: tracker.userProfiles.size,
      experiments: abTesting.experiments.size
    }
  });
});

// ---- Static Files ----

app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- Error Handlers ----

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// ---- Server Startup ----

function startServer() {
  // Load catalog
  try {
    const count = catalog.load();
    console.log(`Loaded ${count} products into catalog`);
  } catch (error) {
    console.error('Failed to load catalog:', error.message);
    process.exit(1);
  }

  // Seed simulated data
  console.log('Seeding simulated user behavior data...');
  try {
    const result = tracker.simulateUserSessions(100, catalog);
    console.log(`Simulated ${result.simulatedEvents} user events`);
  } catch (error) {
    console.error('Failed to seed data:', error.message);
  }

  // Create default A/B test experiments
  console.log('Setting up default A/B test experiments...');
  try {
    const exp1 = abTesting.createRecommendationStrategyExperiment();
    abTesting.startExperiment(exp1.id);
    console.log(`Started experiment: ${exp1.name} (${exp1.id})`);

    const exp2 = abTesting.createLayoutExperiment();
    abTesting.startExperiment(exp2.id);
    console.log(`Started experiment: ${exp2.name} (${exp2.id})`);
  } catch (error) {
    console.error('Failed to create experiments:', error.message);
  }

  app.listen(PORT, () => {
    console.log(`
========================================
  E-Commerce Recommendation Widget
  Server running on http://localhost:${PORT}
========================================

  API Endpoints:
    Products:    GET  /api/products
    Search:      GET  /api/products/search?q=term
    Categories:  GET  /api/products/categories
    Popular:     GET  /api/products/popular
    
    Personalized: GET  /api/recommendations/personalized?userId=xxx
    Also Bought:  GET  /api/recommendations/also-bought/:productId
    Related:      GET  /api/recommendations/related/:productId
    Trending:     GET  /api/recommendations/trending
    
    Tracking:    POST /api/tracking/view
                 POST /api/tracking/purchase
                 POST /api/tracking/rating
                 POST /api/tracking/cart-add
    
    Experiments: GET  /api/experiments
                 POST /api/experiments/:id/start
                 GET  /api/experiments/:id/results
    
    Simulate:    POST /api/simulate
    Dashboard:   GET  /api/dashboard
    Health:      GET  /api/health
    
    Widget:      GET  /widget
========================================
    `);
  });

  return app;
}

// Start if not in test mode
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = { app, startServer, catalog, tracker, recommender, abTesting };