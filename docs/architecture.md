# Architecture Overview

## E-Commerce Product Recommendation Widget

### System Design

```
+-----------+        +------------------+        +------------------+
|   Client  |        |   Express Server  |        |   Data Sources    |
|  (Widget) |<------>|                  |<------>|  products.json   |
+-----------+        +------------------+        +------------------+
                            |
                            v
                  +------------------+
                  |  Service Layer    |
                  +------------------+
                            |
        +-------------------+-------------------+
        |                   |                   |
        v                   v                   v
  +-----------+     +---------------+     +-----------+
  |  Catalog  |     |  Recommender  |     |  Tracker  |
  +-----------+     +---------------+     +-----------+
        |                   |                   |
        v                   v                   v
  +-----------+     +---------------+     +-----------+
  |  A/B Test |     |  Algorithms   |     |  Events   |
  | Framework |     | - Collaborative |     |  Store    |
  +-----------+     | - Content-Based |     +-----------+
                    | - Hybrid        |
                    +---------------+
```

## Components

### 1. Product Catalog (`src/catalog.js`)
- Loads product data from JSON
- Provides search, filter, and pagination
- Builds tag index for fast lookups
- Computes similarity scores between products

### 2. Behavior Tracker (`src/behavior_tracker.js`)
- Tracks user views, purchases, ratings, cart adds
- Maintains user affinity profiles
- Computes co-purchase patterns
- Provides trending analysis

### 3. Recommendation Engine (`src/recommender.js`)
- **Collaborative Filtering**: User-user similarity using cosine similarity
- **Content-Based Filtering**: Category/tag matching with price range awareness
- **Hybrid**: Weighted combination with diversification
- **Popularity Fallback**: For cold-start users

### 4. A/B Testing Framework (`src/ab_testing.js`)
- Experiment creation with multiple variants
- Deterministic user assignment (consistent hashing)
- Event recording and metrics collection
- Statistical significance calculation

### 5. Express Server (`src/server.js`)
- RESTful API design
- Route organization by domain
- Error handling middleware
- Static file serving for widget

## Data Flow

### Recommendation Request
```
1. Client -> GET /api/recommendations/personalized?userId=xxx
2. Server checks A/B test assignment
3. Recommender loads user profile from tracker
4. Algorithm selection (collaborative/content-based/hybrid)
5. Score products and diversify
6. Return enriched product data
```

### Tracking Event
```
1. Client -> POST /api/tracking/view
2. Server validates input
3. Tracker updates user profile
4. Global stats updated
5. A/B test event recorded (if applicable)
6. Confirmation returned
```

## API Endpoints

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products (paginated, filterable) |
| GET | `/api/products/search` | Search products |
| GET | `/api/products/categories` | Get categories with stats |
| GET | `/api/products/popular` | Get popular products |
| GET | `/api/products/:id` | Get product by ID |
| GET | `/api/products/:id/similar` | Get similar products |

### Recommendations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/recommendations/personalized` | Personalized recommendations |
| GET | `/api/recommendations/also-bought/:id` | "Customers also bought" |
| GET | `/api/recommendations/related/:id` | Related products |
| GET | `/api/recommendations/trending` | Trending products |
| GET | `/api/recommendations/popular` | Popular fallback |

### Tracking
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tracking/view` | Track product view |
| POST | `/api/tracking/purchase` | Track purchase |
| POST | `/api/tracking/rating` | Track rating |
| POST | `/api/tracking/cart-add` | Track add to cart |
| POST | `/api/tracking/click` | Track recommendation click |

### A/B Testing
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/experiments` | List experiments |
| POST | `/api/experiments` | Create experiment |
| GET | `/api/experiments/:id` | Get experiment |
| POST | `/api/experiments/:id/start` | Start experiment |
| POST | `/api/experiments/:id/pause` | Pause experiment |
| POST | `/api/experiments/:id/complete` | Complete experiment |
| GET | `/api/experiments/:id/results` | Get results |

## Algorithm Details

### Collaborative Filtering
- Computes user-user similarity using cosine similarity on affinity vectors
- Affinities derived from views (0.5), purchases (5.0), ratings (rating*0.5), cart (1.0)
- Time decay applied to views (newer = more weight)

### Content-Based Filtering
- Matches user category/tag preferences against product attributes
- Price range awareness with tolerance
- Rating quality and popularity boosts
- Negative penalty for already-viewed products

### Hybrid Strategy
- Normalizes each strategy's scores independently
- Weighted combination: collaborative (0.4), content-based (0.3), popularity (0.2)
- Category diversity enforcement (max 2 per category)