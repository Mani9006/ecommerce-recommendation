/**
 * E-Commerce Recommendation Widget
 * Frontend client for the recommendation API
 */

const API_BASE = '';

// State
const state = {
  currentUser: 'user_0',
  currentProduct: 'p001',
  products: [],
  users: [],
  experiments: [],
  eventLog: []
};

// ---- Icons mapping for products ----
const productIcons = {
  electronics: '\u{1F4BB}', // laptop
  clothing: '\u{1F455}',    // t-shirt
  home: '\u{1F3E0}',        // house
  fitness: '\u{1F3CB}',     // weight lifter
  audio: '\u{1F3A7}',       // headphones
  default: '\u{1F4E6}'      // package
};

function getProductIcon(category) {
  return productIcons[category] || productIcons.default;
}

// ---- API Client ----

async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'API request failed');
    }

    return data;
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
}

// ---- Logging ----

function logEvent(type, message, data = null) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = { timestamp, type, message, data };
  state.eventLog.unshift(entry);
  if (state.eventLog.length > 50) state.eventLog.pop();
  renderEventLog();
}

// ---- Initialization ----

async function init() {
  logEvent('view', 'Initializing widget...');

  try {
    // Fetch products
    const productsData = await api('/api/products?limit=50');
    state.products = productsData.data.products;

    // Generate user list
    state.users = Array.from({ length: 20 }, (_, i) => ({
      id: `user_${i}`,
      name: `User ${i}`
    }));

    // Fetch experiments
    await fetchExperiments();

    // Render UI
    renderUserSelector();
    renderProductSelector();
    renderExperimentSelector();
    renderProductContext();
    renderDashboard();

    // Load recommendations
    await loadAllRecommendations();

    // Load user stats
    await loadUserStats();

    logEvent('view', `Widget initialized with ${state.products.length} products`);
  } catch (error) {
    logEvent('view', `Initialization failed: ${error.message}`);
    showError('Failed to initialize widget. Please try again.');
  }
}

async function fetchExperiments() {
  try {
    const data = await api('/api/experiments');
    state.experiments = data.data;
  } catch {
    state.experiments = [];
  }
}

// ---- Rendering ----

function renderUserSelector() {
  const select = document.getElementById('userSelect');
  select.innerHTML = state.users.map(u => 
    `<option value="${u.id}" ${u.id === state.currentUser ? 'selected' : ''}>${u.name}</option>`
  ).join('');

  select.addEventListener('change', async (e) => {
    state.currentUser = e.target.value;
    logEvent('view', `Switched to ${state.currentUser}`);
    await loadAllRecommendations();
    await loadUserStats();
  });
}

function renderProductSelector() {
  const select = document.getElementById('contextProduct');
  select.innerHTML = state.products.map(p => 
    `<option value="${p.id}" ${p.id === state.currentProduct ? 'selected' : ''}>${p.name} ($${p.price})</option>`
  ).join('');

  select.addEventListener('change', async (e) => {
    state.currentProduct = e.target.value;
    logEvent('view', `Viewing product ${state.currentProduct}`);
    renderProductContext();
    await loadAlsoBought();
    await loadRelated();

    // Track view
    const product = state.products.find(p => p.id === state.currentProduct);
    if (product) {
      try {
        await api('/api/tracking/view', {
          method: 'POST',
          body: {
            userId: state.currentUser,
            productId: state.currentProduct,
            category: product.category,
            tags: product.tags,
            price: product.price
          }
        });
        logEvent('view', `Tracked view for ${product.name}`);
      } catch (err) {
        logEvent('view', `Failed to track view: ${err.message}`);
      }
    }
  });
}

function renderExperimentSelector() {
  const select = document.getElementById('experimentSelect');
  select.innerHTML = '<option value="">None (Use default strategy)</option>' +
    state.experiments.map(e => 
      `<option value="${e.id}">${e.name} (${e.status})</option>`
    ).join('');

  // Strategy and limit change handlers
  document.getElementById('strategySelect').addEventListener('change', () => {
    loadAllRecommendations();
  });

  document.getElementById('limitSelect').addEventListener('change', () => {
    loadAllRecommendations();
  });

  document.getElementById('layoutSelect').addEventListener('change', (e) => {
    applyLayout(e.target.value);
  });

  document.getElementById('experimentSelect').addEventListener('change', () => {
    loadAllRecommendations();
  });
}

function applyLayout(layout) {
  const widgets = document.querySelectorAll('.recommendation-widget');
  widgets.forEach(w => {
    w.classList.remove('grid-layout', 'carousel-layout');
    w.classList.add(layout === 'carousel' ? 'carousel-layout' : 'grid-layout');
  });
}

function renderProductContext() {
  const product = state.products.find(p => p.id === state.currentProduct);
  const container = document.getElementById('productCard');

  if (!product) {
    container.innerHTML = '<p>Product not found</p>';
    return;
  }

  container.innerHTML = `
    <div class="product-image-placeholder">${getProductIcon(product.category)}</div>
    <div class="product-info-large">
      <h3>${product.name}</h3>
      <div class="product-meta">
        <span class="product-price">$${product.price.toFixed(2)}</span>
        <div class="product-rating">
          <span class="stars">${renderStars(product.rating)}</span>
          <span class="rating-value">${product.rating}</span>
          <span>(${product.reviewCount} reviews)</span>
        </div>
        <span class="product-category">${product.category}</span>
      </div>
      <div class="product-tags">
        ${product.tags.map(t => `<span class="tag">${t}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderStars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  let stars = '';
  for (let i = 0; i < full; i++) stars += '\u2605';
  if (half) stars += '\u00BD';
  for (let i = full + (half ? 1 : 0); i < 5; i++) stars += '\u2606';
  return stars;
}

function renderProductCard(rec, index, context) {
  const product = rec.product || rec;
  const reason = rec.reason || '';
  const score = rec.score !== undefined ? rec.score : null;
  const icon = getProductIcon(product.category);

  return `
    <div class="product-card" onclick="handleProductClick('${product.id}', ${index}, '${context}')" style="animation-delay: ${index * 0.05}s">
      ${score !== null ? `<span class="recommendation-score">${typeof score === 'number' ? score.toFixed(2) : score}</span>` : ''}
      <div class="product-card-image">${icon}</div>
      <div class="product-card-body">
        <h4 class="product-card-title">${product.name}</h4>
        <div class="product-card-price">$${product.price.toFixed(2)}</div>
        <div class="product-card-rating">
          <span class="stars">${renderStars(product.rating)}</span>
          <span>${product.rating}</span>
        </div>
        <span class="product-card-category">${product.subcategory || product.category}</span>
        ${reason ? `<span class="recommendation-reason">${formatReason(reason)}</span>` : ''}
      </div>
    </div>
  `;
}

function formatReason(reason) {
  return reason.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ---- Widget Rendering ----

function renderWidget(containerId, data, metaId, context) {
  const container = document.getElementById(containerId);
  const metaEl = document.getElementById(metaId);

  if (metaEl) {
    const strategy = data.strategy || '';
    const experiment = data.experiment;
    const metaText = experiment 
      ? `${strategy} (${experiment.variantName})`
      : strategy;
    metaEl.textContent = metaText;
  }

  if (!data.recommendations || data.recommendations.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">\u{1F50D}</div>
        <p>No recommendations available</p>
      </div>
    `;
    return;
  }

  container.innerHTML = data.recommendations
    .map((rec, i) => renderProductCard(rec, i, context))
    .join('');
}

function renderLoading(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading recommendations...</p>
    </div>
  `;
}

function showError(message) {
  // Could show a toast notification
  console.error(message);
}

// ---- Data Loading ----

async function loadAllRecommendations() {
  renderLoading('personalizedWidget');
  renderLoading('alsoBoughtWidget');
  renderLoading('relatedWidget');
  renderLoading('trendingWidget');

  await Promise.all([
    loadPersonalized(),
    loadAlsoBought(),
    loadRelated(),
    loadTrending()
  ]);
}

async function loadPersonalized() {
  try {
    const limit = document.getElementById('limitSelect').value;
    const strategy = document.getElementById('strategySelect').value;
    const experimentId = document.getElementById('experimentSelect').value;

    let url = `/api/recommendations/personalized?userId=${state.currentUser}&limit=${limit}&strategy=${strategy}`;
    if (experimentId) {
      url += `&experimentId=${experimentId}`;
    }

    const data = await api(url);
    renderWidget('personalizedWidget', data, 'personalizedMeta', 'personalized');
  } catch (error) {
    document.getElementById('personalizedWidget').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">\u{26A0}</div>
        <p>Failed to load recommendations</p>
      </div>
    `;
  }
}

async function loadAlsoBought() {
  try {
    const limit = document.getElementById('limitSelect').value;
    const data = await api(`/api/recommendations/also-bought/${state.currentProduct}?limit=${limit}`);
    renderWidget('alsoBoughtWidget', data, 'alsoBoughtMeta', 'alsoBought');
  } catch (error) {
    document.getElementById('alsoBoughtWidget').innerHTML = `
      <div class="empty-state">
        <p>No "also bought" data available</p>
      </div>
    `;
  }
}

async function loadRelated() {
  try {
    const limit = document.getElementById('limitSelect').value;
    const data = await api(`/api/recommendations/related/${state.currentProduct}?limit=${limit}`);
    renderWidget('relatedWidget', data, 'relatedMeta', 'related');
  } catch (error) {
    document.getElementById('relatedWidget').innerHTML = `
      <div class="empty-state">
        <p>No related products found</p>
      </div>
    `;
  }
}

async function loadTrending() {
  try {
    const limit = document.getElementById('limitSelect').value;
    const data = await api(`/api/recommendations/trending?limit=${limit}`);
    renderWidget('trendingWidget', data, 'trendingMeta', 'trending');
  } catch (error) {
    document.getElementById('trendingWidget').innerHTML = `
      <div class="empty-state">
        <p>No trending data available</p>
      </div>
    `;
  }
}

async function loadUserStats() {
  try {
    const data = await api(`/api/tracking/user/${state.currentUser}`);
    const stats = data.data;
    
    document.getElementById('userStats').innerHTML = `
      <div class="stat-item">
        <div class="stat-value">${stats.totalViews}</div>
        <div class="stat-label">Views</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.totalPurchases}</div>
        <div class="stat-label">Purchases</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.totalRatings}</div>
        <div class="stat-label">Ratings</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.totalCartAdds}</div>
        <div class="stat-label">Cart Adds</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.topCategories.length}</div>
        <div class="stat-label">Categories</div>
      </div>
    `;
  } catch (error) {
    document.getElementById('userStats').innerHTML = '<p>No user data yet</p>';
  }
}

async function renderDashboard() {
  try {
    const data = await api('/api/dashboard');
    const dashboard = data.data;

    document.getElementById('dashboardWidget').innerHTML = `
      <div class="dashboard-grid">
        <div class="dashboard-card">
          <h3>Overview</h3>
          <div class="variant-metrics">
            <div class="metric-box">
              <div class="value">${dashboard.totalExperiments}</div>
              <div class="label">Experiments</div>
            </div>
            <div class="metric-box">
              <div class="value">${dashboard.active}</div>
              <div class="label">Active</div>
            </div>
            <div class="metric-box">
              <div class="value">${dashboard.totalUsers}</div>
              <div class="label">Users</div>
            </div>
          </div>
        </div>
        
        <div class="dashboard-card">
          <h3>Experiments</h3>
          ${state.experiments.map(e => `
            <div class="experiment-item ${e.status}">
              <div class="d-flex justify-between">
                <div class="experiment-name">${e.name}</div>
                <span class="experiment-status status-${e.status}">${e.status}</span>
              </div>
              <div class="variant-row">
                <span>${e.variants.length} variants</span>
                <span>${e.variants.reduce((s, v) => s + v.userCount, 0)} users</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (error) {
    document.getElementById('dashboardWidget').innerHTML = '<p>Dashboard unavailable</p>';
  }
}

function renderEventLog() {
  const container = document.getElementById('eventLog');
  container.innerHTML = state.eventLog.map(e => `
    <div class="event-entry">
      <span class="event-time">${e.timestamp}</span>
      <span class="event-type ${e.type}">${e.type}</span>
      <span class="event-details">${e.message}</span>
    </div>
  `).join('');
}

// ---- Event Handlers ----

async function handleProductClick(productId, position, context) {
  logEvent('view', `Clicked product ${productId} from ${context}`);

  // Track the click
  try {
    const experimentId = document.getElementById('experimentSelect').value;
    
    await api('/api/tracking/click', {
      method: 'POST',
      body: {
        userId: state.currentUser,
        productId,
        position,
        context,
        experimentId: experimentId || undefined,
        variantId: experimentId ? getCurrentVariantId() : undefined
      }
    });

    // Update the context product
    state.currentProduct = productId;
    document.getElementById('contextProduct').value = productId;
    renderProductContext();

    // Reload context-dependent widgets
    await Promise.all([
      loadAlsoBought(),
      loadRelated()
    ]);

    logEvent('view', `Switched context to ${productId}`);
  } catch (error) {
    logEvent('view', `Click tracking failed: ${error.message}`);
  }
}

function getCurrentVariantId() {
  // This would be populated from the API response
  return null;
}

// ---- Simulation ----

document.getElementById('simulateBtn').addEventListener('click', async () => {
  try {
    logEvent('simulate', 'Running simulation...');
    const data = await api('/api/simulate', {
      method: 'POST',
      body: { count: 10 }
    });
    logEvent('simulate', `Simulated ${data.data.simulatedEvents} events`);
    await Promise.all([loadUserStats(), loadAllRecommendations(), renderDashboard()]);
  } catch (error) {
    logEvent('simulate', `Simulation failed: ${error.message}`);
  }
});

document.getElementById('simulateManyBtn').addEventListener('click', async () => {
  try {
    logEvent('simulate', 'Running large simulation...');
    const data = await api('/api/simulate', {
      method: 'POST',
      body: { count: 50 }
    });
    logEvent('simulate', `Simulated ${data.data.simulatedEvents} events`);
    await Promise.all([loadUserStats(), loadAllRecommendations(), renderDashboard()]);
  } catch (error) {
    logEvent('simulate', `Simulation failed: ${error.message}`);
  }
});

// ---- Keyboard Shortcuts ----

document.addEventListener('keydown', (e) => {
  // R to refresh recommendations
  if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
    loadAllRecommendations();
    logEvent('view', 'Refreshed recommendations (R key)');
  }
  
  // S to simulate
  if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
    document.getElementById('simulateBtn').click();
  }
});

// ---- Start ----

document.addEventListener('DOMContentLoaded', init);