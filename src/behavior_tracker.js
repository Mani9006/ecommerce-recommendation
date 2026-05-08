/**
 * User Behavior Tracker
 * Simulates and tracks user interactions for recommendation engine training
 */

class BehaviorTracker {
  constructor() {
    // In-memory storage for user behavior (use Redis in production)
    this.userProfiles = new Map();
    this.globalStats = {
      views: new Map(),
      purchases: new Map(),
      ratings: new Map(),
      cartAdds: new Map(),
      categoryViews: new Map()
    };
    this.interactionHistory = [];
    this.maxHistorySize = 10000;
  }

  /**
   * Get or create a user profile
   */
  getUserProfile(userId) {
    if (!this.userProfiles.has(userId)) {
      this.userProfiles.set(userId, {
        userId,
        viewedProducts: [],
        purchasedProducts: [],
        ratedProducts: [],
        cartProducts: [],
        categoryPreferences: new Map(),
        tagPreferences: new Map(),
        priceRange: { min: Infinity, max: 0 },
        totalSessions: 0,
        lastActive: Date.now()
      });
    }
    return this.userProfiles.get(userId);
  }

  /**
   * Record a product view event
   */
  trackView(userId, productId, metadata = {}) {
    this.validateInput(userId, productId);
    
    const profile = this.getUserProfile(userId);
    const timestamp = Date.now();
    
    // Add to viewed products with deduplication (move to front if exists)
    profile.viewedProducts = profile.viewedProducts.filter(p => p.productId !== productId);
    profile.viewedProducts.unshift({ productId, timestamp, ...metadata });
    
    // Keep last 100 viewed products
    if (profile.viewedProducts.length > 100) {
      profile.viewedProducts = profile.viewedProducts.slice(0, 100);
    }

    // Update global view stats
    const currentViews = this.globalStats.views.get(productId) || 0;
    this.globalStats.views.set(productId, currentViews + 1);

    // Update category preference if category info provided
    if (metadata.category) {
      const catCount = profile.categoryPreferences.get(metadata.category) || 0;
      profile.categoryPreferences.set(metadata.category, catCount + 1);
      
      const globalCatCount = this.globalStats.categoryViews.get(metadata.category) || 0;
      this.globalStats.categoryViews.set(metadata.category, globalCatCount + 1);
    }

    // Update tag preferences
    if (metadata.tags && Array.isArray(metadata.tags)) {
      metadata.tags.forEach(tag => {
        const tagCount = profile.tagPreferences.get(tag) || 0;
        profile.tagPreferences.set(tag, tagCount + 1);
      });
    }

    // Update price range preference
    if (metadata.price) {
      profile.priceRange.min = Math.min(profile.priceRange.min, metadata.price);
      profile.priceRange.max = Math.max(profile.priceRange.max, metadata.price);
    }

    profile.lastActive = timestamp;
    this.recordInteraction(userId, 'view', productId, metadata);
    
    return { success: true, event: 'view', userId, productId };
  }

  /**
   * Record a purchase event
   */
  trackPurchase(userId, productId, metadata = {}) {
    this.validateInput(userId, productId);
    
    const profile = this.getUserProfile(userId);
    const timestamp = Date.now();
    
    profile.purchasedProducts.unshift({ 
      productId, 
      timestamp, 
      quantity: metadata.quantity || 1,
      price: metadata.price || 0
    });
    
    if (profile.purchasedProducts.length > 50) {
      profile.purchasedProducts = profile.purchasedProducts.slice(0, 50);
    }

    const currentPurchases = this.globalStats.purchases.get(productId) || 0;
    this.globalStats.purchases.set(productId, currentPurchases + 1);

    profile.lastActive = timestamp;
    this.recordInteraction(userId, 'purchase', productId, metadata);
    
    return { success: true, event: 'purchase', userId, productId };
  }

  /**
   * Record a rating event
   */
  trackRating(userId, productId, rating, metadata = {}) {
    this.validateInput(userId, productId);
    
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      throw new Error('Rating must be a number between 1 and 5');
    }
    
    const profile = this.getUserProfile(userId);
    const timestamp = Date.now();
    
    // Update existing rating or add new
    profile.ratedProducts = profile.ratedProducts.filter(p => p.productId !== productId);
    profile.ratedProducts.unshift({ productId, rating, timestamp, review: metadata.review || '' });
    
    if (profile.ratedProducts.length > 50) {
      profile.ratedProducts = profile.ratedProducts.slice(0, 50);
    }

    // Store in global ratings
    if (!this.globalStats.ratings.has(productId)) {
      this.globalStats.ratings.set(productId, []);
    }
    const ratings = this.globalStats.ratings.get(productId).filter(r => r.userId !== userId);
    ratings.push({ userId, rating, timestamp });
    this.globalStats.ratings.set(productId, ratings);

    profile.lastActive = timestamp;
    this.recordInteraction(userId, 'rating', productId, { rating, ...metadata });
    
    return { success: true, event: 'rating', userId, productId, rating };
  }

  /**
   * Record add-to-cart event
   */
  trackCartAdd(userId, productId, metadata = {}) {
    this.validateInput(userId, productId);
    
    const profile = this.getUserProfile(userId);
    const timestamp = Date.now();
    
    profile.cartProducts.push({ productId, timestamp, ...metadata });
    
    if (profile.cartProducts.length > 50) {
      profile.cartProducts = profile.cartProducts.slice(0, 50);
    }

    const currentCarts = this.globalStats.cartAdds.get(productId) || 0;
    this.globalStats.cartAdds.set(productId, currentCarts + 1);

    profile.lastActive = timestamp;
    this.recordInteraction(userId, 'cart_add', productId, metadata);
    
    return { success: true, event: 'cart_add', userId, productId };
  }

  /**
   * Get user affinity scores for products
   */
  getUserAffinities(userId) {
    const profile = this.getUserProfile(userId);
    const affinities = new Map();
    
    // View-based affinity (decay over time)
    profile.viewedProducts.forEach((view, idx) => {
      const decay = Math.max(0.1, 1 - (idx / 100));
      const current = affinities.get(view.productId) || 0;
      affinities.set(view.productId, current + (0.5 * decay));
    });
    
    // Purchase-based affinity (strong signal)
    profile.purchasedProducts.forEach((purchase) => {
      const current = affinities.get(purchase.productId) || 0;
      affinities.set(purchase.productId, current + 5);
    });
    
    // Rating-based affinity
    profile.ratedProducts.forEach((rated) => {
      const current = affinities.get(rated.productId) || 0;
      affinities.set(rated.productId, current + (rated.rating * 0.5));
    });
    
    // Cart-based affinity
    profile.cartProducts.forEach((cart) => {
      const current = affinities.get(cart.productId) || 0;
      affinities.set(cart.productId, current + 1);
    });
    
    return affinities;
  }

  /**
   * Get top categories for a user
   */
  getTopCategories(userId, limit = 3) {
    const profile = this.getUserProfile(userId);
    return Array.from(profile.categoryPreferences.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([category, count]) => ({ category, count }));
  }

  /**
   * Get top tags for a user
   */
  getTopTags(userId, limit = 5) {
    const profile = this.getUserProfile(userId);
    return Array.from(profile.tagPreferences.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
  }

  /**
   * Get price range preference for a user
   */
  getPriceRange(userId) {
    const profile = this.getUserProfile(userId);
    if (profile.priceRange.min === Infinity) {
      return { min: 0, max: 1000 };
    }
    return {
      min: profile.priceRange.min,
      max: profile.priceRange.max
    };
  }

  /**
   * Get frequently bought together products
   */
  getFrequentlyBoughtTogether(productId, limit = 5) {
    const coPurchaseCounts = new Map();
    
    // Count how many times other products appear in the same purchase sessions
    this.userProfiles.forEach(profile => {
      const userPurchaseIds = profile.purchasedProducts.map(p => p.productId);
      
      if (userPurchaseIds.includes(productId)) {
        userPurchaseIds.forEach(otherId => {
          if (otherId !== productId) {
            const count = coPurchaseCounts.get(otherId) || 0;
            coPurchaseCounts.set(otherId, count + 1);
          }
        });
      }
    });
    
    return Array.from(coPurchaseCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, count]) => ({ productId: id, coPurchaseCount: count }));
  }

  /**
   * Get trending products (most views in last N interactions)
   */
  getTrending(limit = 10) {
    const recentViews = new Map();
    const recentInteractions = this.interactionHistory.slice(-1000);
    
    recentInteractions.forEach(interaction => {
      if (interaction.event === 'view') {
        const count = recentViews.get(interaction.productId) || 0;
        recentViews.set(interaction.productId, count + 1);
      }
    });
    
    return Array.from(recentViews.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([productId, viewCount]) => ({ productId, viewCount }));
  }

  /**
   * Generate a user activity summary
   */
  getUserSummary(userId) {
    const profile = this.getUserProfile(userId);
    return {
      userId: profile.userId,
      totalViews: profile.viewedProducts.length,
      totalPurchases: profile.purchasedProducts.length,
      totalRatings: profile.ratedProducts.length,
      totalCartAdds: profile.cartProducts.length,
      topCategories: this.getTopCategories(userId, 5),
      topTags: this.getTopTags(userId, 10),
      priceRange: this.getPriceRange(userId),
      lastActive: profile.lastActive
    };
  }

  /**
   * Get global product statistics
   */
  getGlobalStats() {
    return {
      totalViews: Array.from(this.globalStats.views.values()).reduce((a, b) => a + b, 0),
      totalPurchases: Array.from(this.globalStats.purchases.values()).reduce((a, b) => a + b, 0),
      totalRatings: Array.from(this.globalStats.ratings.values()).reduce((a, b) => a + b.length, 0),
      totalCartAdds: Array.from(this.globalStats.cartAdds.values()).reduce((a, b) => a + b, 0),
      uniqueUsers: this.userProfiles.size,
      totalInteractions: this.interactionHistory.length
    };
  }

  /**
   * Simulate user behavior for testing
   */
  simulateUserSessions(count = 50, catalog) {
    const products = catalog ? catalog.getAllProducts() : [];
    if (products.length === 0) {
      throw new Error('Catalog required for simulation');
    }
    
    const events = [];
    
    for (let i = 0; i < count; i++) {
      const userId = `user_${Math.floor(Math.random() * 20)}`;
      const eventType = Math.random();
      const product = products[Math.floor(Math.random() * products.length)];
      
      try {
        if (eventType < 0.6) {
          this.trackView(userId, product.id, {
            category: product.category,
            tags: product.tags,
            price: product.price
          });
          events.push({ userId, event: 'view', productId: product.id });
        } else if (eventType < 0.75) {
          this.trackPurchase(userId, product.id, { price: product.price, quantity: 1 });
          events.push({ userId, event: 'purchase', productId: product.id });
        } else if (eventType < 0.9) {
          const rating = Math.floor(Math.random() * 3) + 3; // 3-5 stars mostly
          this.trackRating(userId, product.id, rating);
          events.push({ userId, event: 'rating', productId: product.id, rating });
        } else {
          this.trackCartAdd(userId, product.id, { price: product.price });
          events.push({ userId, event: 'cart_add', productId: product.id });
        }
      } catch (err) {
        // Skip invalid events
      }
    }
    
    return { simulatedEvents: events.length };
  }

  recordInteraction(userId, event, productId, metadata) {
    this.interactionHistory.push({
      userId,
      event,
      productId,
      timestamp: Date.now(),
      ...metadata
    });
    
    if (this.interactionHistory.length > this.maxHistorySize) {
      this.interactionHistory = this.interactionHistory.slice(-this.maxHistorySize / 2);
    }
  }

  validateInput(userId, productId) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId');
    }
    if (!productId || typeof productId !== 'string') {
      throw new Error('Invalid productId');
    }
  }

  clear() {
    this.userProfiles.clear();
    this.globalStats.views.clear();
    this.globalStats.purchases.clear();
    this.globalStats.ratings.clear();
    this.globalStats.cartAdds.clear();
    this.globalStats.categoryViews.clear();
    this.interactionHistory = [];
  }
}

module.exports = BehaviorTracker;