/**
 * Recommendation Engine
 * Implements collaborative filtering, content-based filtering, and hybrid approaches
 */

class RecommendationEngine {
  constructor(catalog, behaviorTracker) {
    this.catalog = catalog;
    this.tracker = behaviorTracker;
    this.weights = {
      collaborative: 0.4,
      contentBased: 0.3,
      popularity: 0.2,
      diversity: 0.1
    };
    this.minSupport = 2; // Minimum co-occurrence for similarity
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get personalized recommendations for a user
   */
  getRecommendations(userId, options = {}) {
    const {
      limit = 8,
      strategy = 'hybrid',
      excludePurchased = true,
      diversify = true
    } = options;

    this.catalog.ensureLoaded();

    const profile = this.tracker.getUserProfile(userId);
    const hasHistory = profile.viewedProducts.length > 0 || 
                      profile.purchasedProducts.length > 0;

    // For new users without history, fall back to popularity
    if (!hasHistory) {
      return this.getPopularRecommendations(limit);
    }

    let scored = [];

    switch (strategy) {
      case 'collaborative':
        scored = this.collaborativeFiltering(userId);
        break;
      case 'content-based':
        scored = this.contentBasedFiltering(userId);
        break;
      case 'hybrid':
        scored = this.hybridRecommendations(userId);
        break;
      case 'popular':
        return this.getPopularRecommendations(limit);
      default:
        scored = this.hybridRecommendations(userId);
    }

    // Exclude already purchased products
    if (excludePurchased) {
      const purchasedIds = new Set(profile.purchasedProducts.map(p => p.productId));
      scored = scored.filter(s => !purchasedIds.has(s.productId));
    }

    // Diversify results
    if (diversify && scored.length > limit) {
      scored = this.diversifyResults(scored, limit);
    }

    // Build response
    const recommendations = scored.slice(0, limit).map(item => {
      const product = this.catalog.getProduct(item.productId);
      return {
        product,
        score: Math.round(item.score * 1000) / 1000,
        reason: item.reason || 'recommended'
      };
    }).filter(r => r.product !== null);

    return {
      userId,
      strategy,
      count: recommendations.length,
      recommendations
    };
  }

  /**
   * Collaborative Filtering using User-User similarity
   */
  collaborativeFiltering(userId) {
    const allProfiles = this.tracker.userProfiles;
    const targetProfile = allProfiles.get(userId);
    
    if (!targetProfile) return [];

    // Get user affinities
    const targetAffinities = this.tracker.getUserAffinities(userId);
    const targetProducts = new Set(targetAffinities.keys());

    // Find similar users
    const userSimilarities = [];
    
    allProfiles.forEach((profile, otherUserId) => {
      if (otherUserId === userId) return;
      
      const otherAffinities = this.tracker.getUserAffinities(otherUserId);
      const similarity = this.cosineSimilarity(targetAffinities, otherAffinities);
      
      if (similarity > 0) {
        userSimilarities.push({ userId: otherUserId, similarity });
      }
    });

    // Sort by similarity and take top K
    userSimilarities.sort((a, b) => b.similarity - a.similarity);
    const topK = userSimilarities.slice(0, 10);

    // Aggregate recommendations from similar users
    const productScores = new Map();
    
    topK.forEach(({ userId: simUserId, similarity }) => {
      const simProfile = allProfiles.get(simUserId);
      const simAffinities = this.tracker.getUserAffinities(simUserId);
      
      simAffinities.forEach((affinity, productId) => {
        if (!targetProducts.has(productId)) {
          const current = productScores.get(productId) || 0;
          productScores.set(productId, current + (similarity * affinity));
        }
      });
    });

    return Array.from(productScores.entries())
      .map(([productId, score]) => ({
        productId,
        score,
        reason: 'customers-like-you'
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Content-Based Filtering using product features
   */
  contentBasedFiltering(userId) {
    const profile = this.tracker.getUserProfile(userId);
    const topCategories = this.tracker.getTopCategories(userId, 5);
    const topTags = this.tracker.getTopTags(userId, 10);
    const priceRange = this.tracker.getPriceRange(userId);
    const allProducts = this.catalog.getAllProducts();
    
    const scoredProducts = allProducts.map(product => {
      let score = 0;
      const reasons = [];

      // Category match
      const catMatch = topCategories.find(c => c.category === product.category);
      if (catMatch) {
        const catBoost = catMatch.count / 10;
        score += catBoost * 2;
        reasons.push('category-match');
      }

      // Tag match
      const matchedTags = product.tags.filter(tag => 
        topTags.some(t => t.tag === tag)
      );
      if (matchedTags.length > 0) {
        score += matchedTags.length * 1.5;
        reasons.push('tag-match');
      }

      // Price range match
      if (product.price >= priceRange.min * 0.5 && 
          product.price <= priceRange.max * 1.5) {
        score += 1;
        reasons.push('price-match');
      }

      // Rating quality boost
      score += (product.rating - 3) * 0.5;

      // Popularity boost
      score += (product.popularity || 50) / 100;

      // Recent views boost
      const recentView = profile.viewedProducts.find(v => v.productId === product.id);
      if (recentView) {
        score *= 0.3; // Penalize already viewed
      }

      return {
        productId: product.id,
        score,
        reason: reasons[0] || 'content-similarity'
      };
    });

    // Boost products similar to highly rated products
    profile.ratedProducts.forEach(rated => {
      const ratedProduct = this.catalog.getProduct(rated.productId);
      if (ratedProduct && rated.rating >= 4) {
        scoredProducts.forEach(sp => {
          if (sp.productId === rated.productId) return;
          const product = this.catalog.getProduct(sp.productId);
          if (!product) return;

          const catBoost = product.category === ratedProduct.category ? 1 : 0;
          const tagOverlap = product.tags.filter(t => ratedProduct.tags.includes(t)).length;
          
          sp.score += (catBoost * rated.rating * 0.3) + (tagOverlap * rated.rating * 0.2);
        });
      }
    });

    return scoredProducts.sort((a, b) => b.score - a.score);
  }

  /**
   * Hybrid: Combine collaborative + content-based + popularity
   */
  hybridRecommendations(userId) {
    const collaborative = this.collaborativeFiltering(userId);
    const contentBased = this.contentBasedFiltering(userId);

    // Normalize scores
    const normalize = (items) => {
      if (items.length === 0) return items;
      const max = Math.max(...items.map(i => i.score));
      if (max === 0) return items;
      return items.map(i => ({ ...i, score: i.score / max }));
    };

    const normCollab = normalize(collaborative);
    const normContent = normalize(contentBased);

    // Merge scores
    const merged = new Map();

    normCollab.forEach(item => {
      merged.set(item.productId, {
        ...item,
        score: item.score * this.weights.collaborative
      });
    });

    normContent.forEach(item => {
      const existing = merged.get(item.productId);
      if (existing) {
        existing.score += item.score * this.weights.contentBased;
        if (!existing.reason.includes(item.reason)) {
          existing.reason = `${existing.reason},${item.reason}`;
        }
      } else {
        merged.set(item.productId, {
          ...item,
          score: item.score * this.weights.contentBased
        });
      }
    });

    // Add popularity component
    const allProducts = this.catalog.getAllProducts();
    merged.forEach((item, productId) => {
      const product = allProducts.find(p => p.id === productId);
      if (product && product.popularity) {
        item.score += (product.popularity / 100) * this.weights.popularity;
      }
    });

    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get "Customers also bought" recommendations
   */
  getCustomersAlsoBought(productId, options = {}) {
    const { limit = 6 } = options;
    
    // Get co-purchase data
    const coPurchases = this.tracker.getFrequentlyBoughtTogether(productId, limit * 2);
    
    // Enrich with product data
    const enriched = coPurchases.map(item => {
      const product = this.catalog.getProduct(item.productId);
      return product ? { product, score: item.coPurchaseCount } : null;
    }).filter(Boolean);

    // If not enough co-purchase data, add similar products
    if (enriched.length < limit) {
      const similar = this.catalog.getSimilar(productId, limit - enriched.length);
      similar.forEach(product => {
        enriched.push({ product, score: 1 });
      });
    }

    return {
      productId,
      count: Math.min(enriched.length, limit),
      recommendations: enriched.slice(0, limit).map(r => ({
        product: r.product,
        score: r.score,
        reason: 'customers-also-bought'
      }))
    };
  }

  /**
   * Get popular recommendations for new users
   */
  getPopularRecommendations(limit = 8) {
    const popular = this.catalog.getPopular(limit);
    
    return {
      userId: null,
      strategy: 'popular',
      count: popular.length,
      recommendations: popular.map(product => ({
        product,
        score: product.popularity || 50,
        reason: 'trending'
      }))
    };
  }

  /**
   * Get trending products
   */
  getTrending(limit = 8) {
    const trending = this.tracker.getTrending(limit * 2);
    
    const enriched = trending
      .map(item => {
        const product = this.catalog.getProduct(item.productId);
        return product ? { product, score: item.viewCount } : null;
      })
      .filter(Boolean);

    return {
      count: Math.min(enriched.length, limit),
      recommendations: enriched.slice(0, limit).map(r => ({
        product: r.product,
        score: r.score,
        reason: 'trending-now'
      }))
    };
  }

  /**
   * Get related products (for product detail page)
   */
  getRelatedProducts(productId, options = {}) {
    const { limit = 6, includeSimilar = true, includeCoPurchase = true } = options;
    
    const results = [];
    const added = new Set();

    // Co-purchase recommendations
    if (includeCoPurchase) {
      const coPurchase = this.getCustomersAlsoBought(productId, { limit });
      coPurchase.recommendations.forEach(r => {
        if (!added.has(r.product.id)) {
          added.add(r.product.id);
          results.push(r);
        }
      });
    }

    // Similar products by features
    if (includeSimilar && results.length < limit) {
      const similar = this.catalog.getSimilar(productId, limit - results.length);
      similar.forEach(product => {
        if (!added.has(product.id)) {
          added.add(product.id);
          results.push({
            product,
            score: 1,
            reason: 'similar-products'
          });
        }
      });
    }

    return {
      productId,
      count: results.length,
      recommendations: results.slice(0, limit)
    };
  }

  /**
   * Compute cosine similarity between two maps
   */
  cosineSimilarity(mapA, mapB) {
    const keysA = new Set(mapA.keys());
    const keysB = new Set(mapB.keys());
    const intersection = new Set([...keysA].filter(x => keysB.has(x)));
    
    if (intersection.size === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    keysA.forEach(key => {
      const valA = mapA.get(key) || 0;
      normA += valA * valA;
    });

    keysB.forEach(key => {
      const valB = mapB.get(key) || 0;
      normB += valB * valB;
    });

    intersection.forEach(key => {
      dotProduct += (mapA.get(key) || 0) * (mapB.get(key) || 0);
    });

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Diversify results by category
   */
  diversifyResults(scored, limit) {
    const categoryCounts = new Map();
    const diversified = [];
    const remaining = [...scored];

    while (diversified.length < limit && remaining.length > 0) {
      // Find the next best item that doesn't over-represent a category
      let selected = null;
      let selectedIdx = -1;

      for (let i = 0; i < remaining.length; i++) {
        const product = this.catalog.getProduct(remaining[i].productId);
        if (!product) continue;

        const catCount = categoryCounts.get(product.category) || 0;
        
        // Allow up to 2 items per category
        if (catCount < 2) {
          selected = remaining[i];
          selectedIdx = i;
          break;
        }
      }

      // If no diverse option found, take the best remaining
      if (!selected && remaining.length > 0) {
        selected = remaining[0];
        selectedIdx = 0;
      }

      if (selected) {
        const product = this.catalog.getProduct(selected.productId);
        if (product) {
          const catCount = categoryCounts.get(product.category) || 0;
          categoryCounts.set(product.category, catCount + 1);
        }
        diversified.push(selected);
        remaining.splice(selectedIdx, 1);
      }
    }

    return diversified;
  }

  /**
   * Update recommendation weights
   */
  setWeights(newWeights) {
    this.weights = { ...this.weights, ...newWeights };
    return { ...this.weights };
  }

  /**
   * Get current weights
   */
  getWeights() {
    return { ...this.weights };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = RecommendationEngine;