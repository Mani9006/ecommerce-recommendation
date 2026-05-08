/**
 * Product Catalog Manager
 * Handles product retrieval, filtering, and catalog operations
 */

const fs = require('fs');
const path = require('path');

class ProductCatalog {
  constructor(dataPath) {
    this.products = new Map();
    this.categories = new Set();
    this.subcategories = new Set();
    this.tagIndex = new Map();
    this.dataPath = dataPath || path.join(__dirname, '..', 'data', 'products.json');
    this.loaded = false;
  }

  /**
   * Load products from JSON file
   */
  load() {
    try {
      const raw = fs.readFileSync(this.dataPath, 'utf8');
      const data = JSON.parse(raw);
      
      if (!data.products || !Array.isArray(data.products)) {
        throw new Error('Invalid product data format');
      }

      data.products.forEach(product => {
        this.validateProduct(product);
        this.products.set(product.id, product);
        this.categories.add(product.category);
        this.subcategories.add(product.subcategory);
        
        // Build tag index
        product.tags.forEach(tag => {
          if (!this.tagIndex.has(tag)) {
            this.tagIndex.set(tag, new Set());
          }
          this.tagIndex.get(tag).add(product.id);
        });
      });

      this.loaded = true;
      return this.products.size;
    } catch (error) {
      throw new Error(`Failed to load product catalog: ${error.message}`);
    }
  }

  /**
   * Validate product structure
   */
  validateProduct(product) {
    const required = ['id', 'name', 'category', 'price', 'tags'];
    for (const field of required) {
      if (!product[field]) {
        throw new Error(`Product missing required field: ${field}`);
      }
    }
    if (typeof product.price !== 'number' || product.price < 0) {
      throw new Error(`Invalid price for product ${product.id}`);
    }
    if (!Array.isArray(product.tags)) {
      throw new Error(`Invalid tags for product ${product.id}`);
    }
  }

  /**
   * Get all products
   */
  getAllProducts() {
    this.ensureLoaded();
    return Array.from(this.products.values());
  }

  /**
   * Get product by ID
   */
  getProduct(id) {
    this.ensureLoaded();
    return this.products.get(id) || null;
  }

  /**
   * Get multiple products by IDs
   */
  getProducts(ids) {
    this.ensureLoaded();
    return ids
      .map(id => this.products.get(id))
      .filter(p => p !== undefined);
  }

  /**
   * Get products by category
   */
  getByCategory(category) {
    this.ensureLoaded();
    return this.getAllProducts().filter(p => p.category === category);
  }

  /**
   * Get products by subcategory
   */
  getBySubcategory(subcategory) {
    this.ensureLoaded();
    return this.getAllProducts().filter(p => p.subcategory === subcategory);
  }

  /**
   * Get products by tag
   */
  getByTag(tag) {
    this.ensureLoaded();
    const ids = this.tagIndex.get(tag);
    if (!ids) return [];
    return this.getProducts(Array.from(ids));
  }

  /**
   * Search products by name or tags
   */
  search(query) {
    this.ensureLoaded();
    const lower = query.toLowerCase();
    return this.getAllProducts().filter(p => {
      const nameMatch = p.name.toLowerCase().includes(lower);
      const tagMatch = p.tags.some(t => t.toLowerCase().includes(lower));
      const categoryMatch = p.category.toLowerCase().includes(lower);
      return nameMatch || tagMatch || categoryMatch;
    });
  }

  /**
   * Get products with pagination and sorting
   */
  getPaginated(options = {}) {
    this.ensureLoaded();
    const {
      page = 1,
      limit = 10,
      sortBy = 'popularity',
      order = 'desc',
      category = null,
      minPrice = null,
      maxPrice = null,
      minRating = null
    } = options;

    let results = this.getAllProducts();

    // Apply filters
    if (category) {
      results = results.filter(p => p.category === category);
    }
    if (minPrice !== null) {
      results = results.filter(p => p.price >= minPrice);
    }
    if (maxPrice !== null) {
      results = results.filter(p => p.price <= maxPrice);
    }
    if (minRating !== null) {
      results = results.filter(p => p.rating >= minRating);
    }

    // Apply sorting
    results.sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });

    const total = results.length;
    const start = (page - 1) * limit;
    const paginated = results.slice(start, start + limit);

    return {
      products: paginated,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get similar products based on category and tags
   */
  getSimilar(productId, limit = 5) {
    this.ensureLoaded();
    const product = this.products.get(productId);
    if (!product) return [];

    const scores = new Map();
    
    this.getAllProducts().forEach(other => {
      if (other.id === productId) return;
      
      let score = 0;
      
      // Category match
      if (other.category === product.category) score += 3;
      if (other.subcategory === product.subcategory) score += 2;
      
      // Tag overlap
      const commonTags = other.tags.filter(t => product.tags.includes(t));
      score += commonTags.length * 2;
      
      // Price similarity (closer = better)
      const priceDiff = Math.abs(other.price - product.price) / product.price;
      score += Math.max(0, 1 - priceDiff);
      
      // Rating bonus
      score += (other.rating || 0) * 0.1;
      
      scores.set(other.id, score);
    });

    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => this.products.get(id));

    return sorted;
  }

  /**
   * Get all categories
   */
  getCategories() {
    this.ensureLoaded();
    return Array.from(this.categories);
  }

  /**
   * Get category stats
   */
  getCategoryStats() {
    this.ensureLoaded();
    const stats = {};
    
    this.getAllProducts().forEach(p => {
      if (!stats[p.category]) {
        stats[p.category] = {
          count: 0,
          avgPrice: 0,
          avgRating: 0,
          totalPrice: 0,
          totalRating: 0
        };
      }
      stats[p.category].count++;
      stats[p.category].totalPrice += p.price;
      stats[p.category].totalRating += p.rating || 0;
    });

    for (const cat of Object.keys(stats)) {
      const s = stats[cat];
      s.avgPrice = Math.round((s.totalPrice / s.count) * 100) / 100;
      s.avgRating = Math.round((s.totalRating / s.count) * 100) / 100;
      delete s.totalPrice;
      delete s.totalRating;
    }

    return stats;
  }

  /**
   * Get price range
   */
  getPriceRange() {
    this.ensureLoaded();
    const prices = this.getAllProducts().map(p => p.price);
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100
    };
  }

  /**
   * Get popular products
   */
  getPopular(limit = 10) {
    this.ensureLoaded();
    return this.getAllProducts()
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, limit);
  }

  ensureLoaded() {
    if (!this.loaded) {
      this.load();
    }
  }

  getProductCount() {
    return this.products.size;
  }
}

module.exports = ProductCatalog;