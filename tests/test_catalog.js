/**
 * Product Catalog Tests
 * Tests for catalog loading, product retrieval, and catalog operations
 */

const fs = require('fs');
const path = require('path');
const ProductCatalog = require('../src/catalog');

describe('ProductCatalog', () => {
  let catalog;

  beforeEach(() => {
    catalog = new ProductCatalog();
  });

  afterEach(() => {
    catalog = null;
  });

  // ---- Constructor ----

  describe('constructor', () => {
    test('should initialize with empty state', () => {
      expect(catalog.loaded).toBe(false);
      expect(catalog.products.size).toBe(0);
      expect(catalog.categories.size).toBe(0);
    });

    test('should accept custom data path', () => {
      const customCatalog = new ProductCatalog(
        path.join(__dirname, '..', 'data', 'products.json')
      );
      expect(customCatalog.dataPath).toContain('products.json');
    });
  });

  // ---- Load ----

  describe('load', () => {
    test('should load products from data file', () => {
      const count = catalog.load();
      expect(count).toBeGreaterThan(0);
      expect(catalog.loaded).toBe(true);
    });

    test('should populate products map', () => {
      catalog.load();
      expect(catalog.products.size).toBeGreaterThan(0);
    });

    test('should populate categories', () => {
      catalog.load();
      expect(catalog.categories.size).toBeGreaterThan(0);
    });

    test('should build tag index', () => {
      catalog.load();
      expect(catalog.tagIndex.size).toBeGreaterThan(0);
    });

    test('should throw error for invalid file path', () => {
      const badCatalog = new ProductCatalog('/nonexistent/path.json');
      expect(() => badCatalog.load()).toThrow();
    });

    test('should throw error for invalid JSON format', () => {
      const tempFile = path.join(__dirname, 'temp_invalid.json');
      fs.writeFileSync(tempFile, '{"invalid": "data"}');
      
      const badCatalog = new ProductCatalog(tempFile);
      expect(() => badCatalog.load()).toThrow('Invalid product data format');
      
      fs.unlinkSync(tempFile);
    });
  });

  // ---- Product Retrieval ----

  describe('getProduct', () => {
    beforeEach(() => {
      catalog.load();
    });

    test('should retrieve product by ID', () => {
      const product = catalog.getProduct('p001');
      expect(product).toBeDefined();
      expect(product.id).toBe('p001');
    });

    test('should return null for non-existent product', () => {
      const product = catalog.getProduct('nonexistent');
      expect(product).toBeNull();
    });

    test('should auto-load catalog if not loaded', () => {
      const freshCatalog = new ProductCatalog();
      const product = freshCatalog.getProduct('p001');
      expect(product).toBeDefined();
      expect(product.id).toBe('p001');
    });
  });

  describe('getProducts', () => {
    beforeEach(() => {
      catalog.load();
    });

    test('should retrieve multiple products by IDs', () => {
      const products = catalog.getProducts(['p001', 'p002', 'p003']);
      expect(products).toHaveLength(3);
      expect(products[0].id).toBe('p001');
      expect(products[1].id).toBe('p002');
    });

    test('should filter out non-existent products', () => {
      const products = catalog.getProducts(['p001', 'nonexistent', 'p002']);
      expect(products).toHaveLength(2);
    });

    test('should return empty array for empty input', () => {
      const products = catalog.getProducts([]);
      expect(products).toEqual([]);
    });
  });

  describe('getAllProducts', () => {
    test('should return all products', () => {
      catalog.load();
      const products = catalog.getAllProducts();
      expect(products.length).toBeGreaterThan(0);
      expect(Array.isArray(products)).toBe(true);
    });
  });

  // ---- Category Methods ----

  describe('getByCategory', () => {
    beforeEach(() => {
      catalog.load();
    });

    test('should filter products by category', () => {
      const products = catalog.getByCategory('electronics');
      expect(products.length).toBeGreaterThan(0);
      expect(products.every(p => p.category === 'electronics')).toBe(true);
    });

    test('should return empty array for non-existent category', () => {
      const products = catalog.getByCategory('nonexistent');
      expect(products).toEqual([]);
    });
  });

  describe('getBySubcategory', () => {
    beforeEach(() => {
      catalog.load();
    });

    test('should filter products by subcategory', () => {
      const products = catalog.getBySubcategory('audio');
      expect(products.every(p => p.subcategory === 'audio')).toBe(true);
    });
  });

  describe('getCategories', () => {
    test('should return all unique categories', () => {
      catalog.load();
      const categories = catalog.getCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
      expect(new Set(categories).size).toBe(categories.length); // Unique
    });
  });

  describe('getCategoryStats', () => {
    test('should return statistics per category', () => {
      catalog.load();
      const stats = catalog.getCategoryStats();
      
      expect(Object.keys(stats).length).toBeGreaterThan(0);
      
      const firstCategory = Object.keys(stats)[0];
      expect(stats[firstCategory]).toHaveProperty('count');
      expect(stats[firstCategory]).toHaveProperty('avgPrice');
      expect(stats[firstCategory]).toHaveProperty('avgRating');
      expect(typeof stats[firstCategory].count).toBe('number');
      expect(typeof stats[firstCategory].avgPrice).toBe('number');
    });
  });

  // ---- Tag Search ----

  describe('getByTag', () => {
    beforeEach(() => {
      catalog.load();
    });

    test('should return products matching tag', () => {
      const products = catalog.getByTag('bluetooth');
      expect(products.length).toBeGreaterThan(0);
      expect(products.every(p => p.tags.includes('bluetooth'))).toBe(true);
    });

    test('should return empty array for non-existent tag', () => {
      const products = catalog.getByTag('nonexistent_tag_12345');
      expect(products).toEqual([]);
    });
  });

  // ---- Search ----

  describe('search', () => {
    beforeEach(() => {
      catalog.load();
    });

    test('should find products by name', () => {
      const results = catalog.search('Headphones');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(p => p.name.toLowerCase().includes('headphones'))).toBe(true);
    });

    test('should find products by tag', () => {
      const results = catalog.search('bluetooth');
      expect(results.length).toBeGreaterThan(0);
    });

    test('should find products by category', () => {
      const results = catalog.search('electronics');
      expect(results.length).toBeGreaterThan(0);
    });

    test('should be case insensitive', () => {
      const lower = catalog.search('headphones');
      const upper = catalog.search('HEADPHONES');
      expect(lower.length).toBe(upper.length);
    });

    test('should return empty array for no matches', () => {
      const results = catalog.search('xyznonexistent123');
      expect(results).toEqual([]);
    });

    test('should handle empty string', () => {
      const results = catalog.search('');
      // Empty search might match everything or nothing depending on includes('')
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // ---- Pagination ----

  describe('getPaginated', () => {
    beforeEach(() => {
      catalog.load();
    });

    test('should return paginated results', () => {
      const result = catalog.getPaginated({ page: 1, limit: 5 });
      
      expect(result).toHaveProperty('products');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('totalPages');
      expect(result.products.length).toBeLessThanOrEqual(5);
      expect(result.page).toBe(1);
    });

    test('should respect page parameter', () => {
      const page1 = catalog.getPaginated({ page: 1, limit: 3 });
      const page2 = catalog.getPaginated({ page: 2, limit: 3 });
      
      expect(page1.products[0].id).not.toBe(page2.products[0].id);
    });

    test('should filter by category', () => {
      const result = catalog.getPaginated({ category: 'electronics' });
      expect(result.products.every(p => p.category === 'electronics')).toBe(true);
    });

    test('should filter by price range', () => {
      const result = catalog.getPaginated({ minPrice: 0, maxPrice: 50 });
      expect(result.products.every(p => p.price <= 50)).toBe(true);
    });

    test('should filter by minimum rating', () => {
      const result = catalog.getPaginated({ minRating: 4.5 });
      expect(result.products.every(p => p.rating >= 4.5)).toBe(true);
    });

    test('should sort products', () => {
      const result = catalog.getPaginated({ 
        sortBy: 'price', 
        order: 'asc' 
      });
      
      for (let i = 1; i < result.products.length; i++) {
        expect(result.products[i].price).toBeGreaterThanOrEqual(result.products[i - 1].price);
      }
    });
  });

  // ---- Similar Products ----

  describe('getSimilar', () => {
    beforeEach(() => {
      catalog.load();
    });

    test('should find similar products', () => {
      const similar = catalog.getSimilar('p001', 5);
      expect(Array.isArray(similar)).toBe(true);
      expect(similar.length).toBeLessThanOrEqual(5);
    });

    test('should not include the source product', () => {
      const similar = catalog.getSimilar('p001', 10);
      expect(similar.some(p => p.id === 'p001')).toBe(false);
    });

    test('should return empty array for non-existent product', () => {
      const similar = catalog.getSimilar('nonexistent', 5);
      expect(similar).toEqual([]);
    });

    test('should respect limit', () => {
      const similar = catalog.getSimilar('p001', 3);
      expect(similar.length).toBeLessThanOrEqual(3);
    });
  });

  // ---- Price Range ----

  describe('getPriceRange', () => {
    test('should return price statistics', () => {
      catalog.load();
      const range = catalog.getPriceRange();
      
      expect(range).toHaveProperty('min');
      expect(range).toHaveProperty('max');
      expect(range).toHaveProperty('avg');
      expect(range.min).toBeLessThanOrEqual(range.max);
      expect(range.avg).toBeGreaterThanOrEqual(range.min);
      expect(range.avg).toBeLessThanOrEqual(range.max);
    });
  });

  // ---- Popular Products ----

  describe('getPopular', () => {
    beforeEach(() => {
      catalog.load();
    });

    test('should return popular products', () => {
      const popular = catalog.getPopular(5);
      expect(popular.length).toBeLessThanOrEqual(5);
      expect(Array.isArray(popular)).toBe(true);
    });

    test('should sort by popularity', () => {
      const popular = catalog.getPopular(10);
      for (let i = 1; i < popular.length; i++) {
        expect(popular[i].popularity || 0).toBeLessThanOrEqual(
          popular[i - 1].popularity || 0
        );
      }
    });

    test('should respect limit', () => {
      const popular = catalog.getPopular(3);
      expect(popular.length).toBeLessThanOrEqual(3);
    });
  });

  // ---- Validation ----

  describe('validateProduct', () => {
    test('should throw for missing required fields', () => {
      const invalid = { id: 'test', name: 'Test' }; // Missing category, price, tags
      expect(() => catalog.validateProduct(invalid)).toThrow();
    });

    test('should throw for invalid price', () => {
      const invalid = { id: 'test', name: 'Test', category: 'cat', tags: [], price: -1 };
      expect(() => catalog.validateProduct(invalid)).toThrow('Invalid price');
    });

    test('should throw for non-array tags', () => {
      const invalid = { id: 'test', name: 'Test', category: 'cat', tags: 'not-array', price: 10 };
      expect(() => catalog.validateProduct(invalid)).toThrow('Invalid tags');
    });

    test('should not throw for valid product', () => {
      const valid = { id: 'test', name: 'Test', category: 'cat', tags: ['tag'], price: 10 };
      expect(() => catalog.validateProduct(valid)).not.toThrow();
    });
  });

  // ---- Count ----

  describe('getProductCount', () => {
    test('should return correct count after loading', () => {
      catalog.load();
      expect(catalog.getProductCount()).toBeGreaterThan(0);
    });

    test('should return 0 before loading', () => {
      const fresh = new ProductCatalog();
      expect(fresh.getProductCount()).toBe(0);
    });
  });
});