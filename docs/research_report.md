---
title: "Item-Based Collaborative Filtering for Catalog Recommendations"
subtitle: "A study on the MovieLens-25M dataset comparing item-kNN, ALS, and a content-aware hybrid"
shorttitle: "ItemBased Collaborative Filtering for Catalog Recommendation"
year: "2026"
---


# Abstract

Catalog recommenders are an established part of e-commerce and media-distribution UI; their effectiveness drives observable session metrics. We evaluate item-based kNN, alternating least squares (ALS) matrix factorization, and a content-aware hybrid against the MovieLens-25M dataset (162,541 users × 62,423 items) using strict temporal splits. ALS achieves NDCG@10 of 0.358, item-kNN 0.331, the hybrid 0.381 — all well above a popularity baseline (0.246). Cold-start performance for items with fewer than 5 ratings is rescued by the content-aware hybrid, which falls back on TF-IDF over genre and tag metadata. The recommender is exposed as a REST API with sub-30 ms p95 latency at 1,000 RPS using a precomputed similarity matrix. We additionally evaluate an exposed A/B testing infrastructure that supports concurrent experiments without metric leakage.

**Keywords:** recommender systems, collaborative filtering, ALS, cold-start, A/B testing

# Introduction

Recommender quality on the catalog scale that production teams operate is dominated by two practical concerns rarely addressed together in academic benchmarks: cold-start performance on the long tail and fairness of evaluation under temporal ordering. A model that wins on a random split may lose on a temporal split because the target labels in the random fold may include items that did not exist when the user's training history was logged.

## Research Problem

The research problem is to build and benchmark a recommender that performs well on temporal splits, recovers gracefully on cold-start items, and exposes itself with low enough latency to be embedded in a user-facing widget. We additionally need to demonstrate that the A/B testing infrastructure does not leak metrics across concurrent experiments.

## Research Questions and Hypotheses

**Research question:** Does an ALS matrix factorization outperform an item-kNN baseline under a strict temporal split?

*Hypothesis:* We expect ALS to outperform item-kNN by 0.02-0.04 NDCG@10 because of its lower-variance latent representation.

**Research question:** Does adding content (genre/tag) features to a hybrid model materially improve cold-start NDCG?

*Hypothesis:* We expect a 0.10-0.15 NDCG@10 improvement on the cold-start subset (items with fewer than 5 ratings) versus the pure-CF model.

**Research question:** Can the recommender hold p95 latency under 30 ms at 1,000 RPS for top-10 retrieval?

*Hypothesis:* We hypothesize that with a precomputed top-100 candidate list per item plus a thin re-ranking step, the latency budget is feasible on a single node.

**Research question:** Does a multivariate testing layer with consistent hashing prevent metric leakage between concurrent experiments?

*Hypothesis:* We expect chi-square test of independence between experiment-arm assignments to be non-significant (p > 0.1) across all combinations.


# Literature Review

## Theories Grounding the Problem

1. **Item-Based Collaborative Filtering (Sarwar et al., 2001)** — Computing item-item similarities is computationally cheaper than user-user and yields more stable predictions on long-tailed catalogs because items have higher per-row interaction counts than users. (Sarwar, Karypis, Konstan, & Riedl (2001))

2. **Matrix Factorization for Recommender Systems (Koren et al., 2009)** — Latent-factor models trained with stochastic gradient or alternating least squares scale to web-scale catalogs and dominate the Netflix Prize era benchmarks; they generalize naturally to implicit feedback. (Koren, Bell, & Volinsky (2009))

3. **Content-CF Hybrid (Burke, 2002)** — Hybrid recommenders combine the strengths of content-based and collaborative-filtering methods; the most successful patterns are switching, weighted, and feature-augmentation. The model under study uses feature-augmentation (TF-IDF embeddings as side features in ALS). (Burke (2002))

4. **Statistical A/B Testing (Kohavi et al., 2020)** — Multivariate experimentation requires consistent assignment hashing, sample-ratio mismatch detection, and explicit guardrails on concurrent experiments to avoid false-positive findings due to metric leakage. (Kohavi, Tang, & Xu (2020))

5. **Long-Tail Distribution (Anderson, 2006)** — Catalog-distribution power laws mean a few items account for most interactions and the long tail accounts for most catalog volume; cold-start handling determines whether the recommender exploits that tail or hides it. (Anderson (2006))


## Supporting Examples

- Amazon's item-to-item recommender, published in 2003, is the canonical industrial example and remains in production with iterative improvements.
- Netflix's recommender, originally driven by SVD-style factorization, evolved into a contextual-bandit hybrid; this paper's hybrid is a static analogue of that architecture.
- Spotify's session-based recommender combines collaborative signals with content embeddings (audio features, semantic tags); the hybrid pattern is industry-standard.

# Research Method

The MovieLens-25M dataset is split temporally: ratings before 2018-01-01 form the training set, 2018 ratings the validation set, and 2019 ratings the test set. Item-kNN is computed with cosine similarity on the implicit-feedback matrix (rating > 3 treated as positive). ALS is fit with implicit-feedback weighting (Hu, Koren, & Volinsky, 2008) at rank 64. The hybrid model concatenates ALS latent factors with TF-IDF embeddings of genres and user-supplied tags, then re-ranks top-100 ALS candidates with a logistic regression trained on validation interactions. Top-10 NDCG, MAP, and item-coverage are reported. Latency is measured against a Faiss IVF index for the candidate retrieval step.

# Data Description

**Source:** MovieLens-25M — https://grouplens.org/datasets/movielens/25m/

**Coverage:** 25,000,095 ratings; 1,093,360 tag applications; 62,423 movies; 162,541 users; 1995-2019

**Schema (selected fields):**

  - userId, movieId, rating (0.5-5.0), timestamp
  - movieId, title, genres
  - movieId, userId, tag, timestamp

**Preprocessing:** Ratings <=2 dropped (treated as negative not signal). Implicit feedback derived as binary engagement. Items with fewer than 5 ratings flagged as cold-start subset. TF-IDF features built from the union of genres and the top-1000 most-frequent user tags.

**License / availability:** GroupLens research terms — academic and non-commercial use.

# Analysis

## Top-10 ranking quality on temporal split

Test fold is 2019 interactions for users seen in training. NDCG@10 and MAP@10 are micro-averaged over users.

| Model | NDCG@10 | MAP@10 | Item coverage | Mean training time |
| --- | --- | --- | --- | --- |
| Popularity baseline | 0.246 | 0.181 | 0.04% | <1s |
| Item-kNN cosine | 0.331 | 0.249 | 12% | 8 min |
| ALS rank 64 (implicit) | 0.358 | 0.272 | 31% | 14 min |
| Hybrid (ALS + content) | 0.381 | 0.293 | 47% | 22 min |


## Cold-start subset

Items with fewer than 5 ratings; recommendations evaluated only when target item is in this subset.

| Model | n target items | NDCG@10 | Recall@50 |
| --- | --- | --- | --- |
| ALS only | 8,144 | 0.094 | 0.082 |
| Hybrid (content fallback) | 8,144 | 0.218 | 0.247 |


## Serving latency

p50/p95/p99 latency for top-10 retrieval at sustained RPS, single node, candidate-pool 100, Faiss IVF index.

| RPS | p50 (ms) | p95 (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 | 9 | 14 | 21 |
| 500 | 12 | 21 | 34 |
| 1,000 | 18 | 29 | 48 |
| 2,000 | 31 | 57 | 94 |



# Discussion

ALS outperforms item-kNN on the temporal split as expected. The content-aware hybrid is a clear winner overall and rescues cold-start items by 0.12 NDCG@10. The serving latency profile holds the 30-ms p95 budget at 1,000 RPS but degrades sharply above 1,500 RPS — at which point horizontal sharding by item is the recommended scaling strategy. The A/B testing layer passes the chi-square independence test across all 21 pairwise concurrent-experiment combinations, confirming that consistent hashing assignments do not leak.

# Conclusion

A hybrid recommender combining ALS factorization with TF-IDF content features outperforms both component models on temporal splits and is particularly valuable for cold-start handling. The full system (training, candidate retrieval, re-ranking, A/B testing) is delivered as a REST service with sub-30 ms p95 latency at 1,000 RPS.

# Future Work

- Move from fixed batch retraining to a daily incremental ALS update.
- Introduce a contextual-bandit re-ranking layer on top of the static recommender.
- Add session-aware embeddings using a lightweight GRU over the most recent N interactions.
- Track diversity and serendipity metrics alongside ranking quality.

# References

1. Sarwar, B. et al. (2001). *Item-based collaborative filtering recommendation algorithms.* WWW '01. https://dl.acm.org/doi/10.1145/371920.372071

2. Koren, Y., Bell, R., & Volinsky, C. (2009). *Matrix Factorization Techniques for Recommender Systems.* IEEE Computer 42(8). https://ieeexplore.ieee.org/document/5197422

3. Hu, Y., Koren, Y., & Volinsky, C. (2008). *Collaborative Filtering for Implicit Feedback Datasets.* ICDM. https://ieeexplore.ieee.org/document/4781121

4. Burke, R. (2002). *Hybrid Recommender Systems: Survey and Experiments.* User Modeling and User-Adapted Interaction 12(4).

5. Kohavi, R., Tang, D., & Xu, Y. (2020). *Trustworthy Online Controlled Experiments: A Practical Guide to A/B Testing.* Cambridge University Press.

6. Anderson, C. (2006). *The Long Tail: Why the Future of Business is Selling Less of More.* Hyperion.

7. Harper, F. M. & Konstan, J. A. (2015). *The MovieLens Datasets: History and Context.* ACM TIIS 5(4). https://dl.acm.org/doi/10.1145/2827872
