//! Turning counts into a ranking.
//!
//! Everything here is a pure function of numbers the database already
//! produced. That is the point: candidate generation needs Postgres and cannot
//! be tested without it, but *how much a shared community is worth against a
//! room being busy* is a judgement call that changes far more often than the
//! SQL does — and it is the part that is wrong when the feed feels wrong. Kept
//! separate, it is arithmetic anyone can read and a test can pin down.

use serde::Serialize;

/// Why an item was recommended.
///
/// Carried through to the response rather than computed for logging alone. A
/// recommendation nobody can explain is one nobody can debug, and "because
/// four people from your communities are in it" is also the line the UI wants
/// to show.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ReasonKind {
    /// People from the communities this viewer belongs to are here too.
    SharedCommunity,
    /// A friend of the viewer is here.
    FriendActivity,
    /// Friends in common — the people surface's version of social proof.
    MutualFriends,
    /// The viewer spends time in this category.
    CategoryAffinity,
    /// Recent conversation, rather than a room that merely exists.
    Activity,
    /// Widely joined. The prior that carries a brand-new account.
    Popularity,
    /// Started recently.
    Freshness,
}

impl ReasonKind {
    /// A short human sentence fragment, for the UI and the admin explain view.
    pub fn describe(self, magnitude: u32) -> String {
        match self {
            Self::SharedCommunity => {
                format!("{magnitude} from your communities")
            }
            Self::FriendActivity => match magnitude {
                1 => "a friend is here".to_owned(),
                n => format!("{n} friends are here"),
            },
            Self::MutualFriends => match magnitude {
                1 => "1 friend in common".to_owned(),
                n => format!("{n} friends in common"),
            },
            Self::CategoryAffinity => "matches what you join".to_owned(),
            Self::Activity => "active conversation".to_owned(),
            Self::Popularity => "popular right now".to_owned(),
            Self::Freshness => "just started".to_owned(),
        }
    }
}

/// One contribution to an item's score.
#[derive(Debug, Clone, Serialize)]
pub struct Reason {
    pub kind: ReasonKind,
    /// The underlying count, so the UI can say "4 friends" rather than "0.67".
    pub magnitude: u32,
    /// What this contributed to the final score.
    pub contribution: f64,
    /// A ready-made sentence fragment.
    pub detail: String,
}

/// An item with its score and the reasons behind it.
#[derive(Debug, Clone, Serialize)]
pub struct Scored<T> {
    #[serde(flatten)]
    pub item: T,
    pub score: f64,
    /// Ordered by contribution, largest first, and trimmed to what actually
    /// mattered — see [`Scorer::finish`].
    pub reasons: Vec<Reason>,
}

/// How much each signal is worth.
///
/// One struct rather than constants scattered through the queries, so the whole
/// ranking policy can be read at once — and so a test can change one weight and
/// assert what moves.
#[derive(Debug, Clone, Copy)]
pub struct Weights {
    pub shared_community: f64,
    pub friend_activity: f64,
    pub mutual_friends: f64,
    pub category_affinity: f64,
    pub activity: f64,
    pub popularity: f64,
    pub freshness: f64,
}

impl Default for Weights {
    fn default() -> Self {
        // Social proof outranks popularity by design. A feed that ranks on
        // popularity alone converges on the same handful of rooms for everyone,
        // which is the failure mode a recommender exists to avoid — but
        // popularity is still here, and non-trivially, because it is the only
        // signal a brand-new account has.
        Self {
            shared_community: 1.0,
            friend_activity: 1.4,
            mutual_friends: 1.5,
            category_affinity: 0.7,
            activity: 0.9,
            popularity: 0.5,
            freshness: 0.3,
        }
    }
}

/// Squash an unbounded count into `[0, 1)` with diminishing returns.
///
/// `half` is the count that scores exactly 0.5, which makes the parameter
/// something you can reason about: "four friends in a room is a strong signal"
/// is `half = 4`.
///
/// Chosen over min-max normalisation because min-max depends on the rest of the
/// candidate set — the same room would score differently depending on what it
/// was ranked against, so a room could rise purely because a better one was
/// filtered out. This transform is a property of the item alone.
///
/// Negative and zero counts both yield 0, so a missing signal never subtracts.
pub fn saturate(value: f64, half: f64) -> f64 {
    if value <= 0.0 || half <= 0.0 {
        return 0.0;
    }
    value / (value + half)
}

/// Exponential decay by age, for recency.
///
/// `half_life` is the age at which the signal is worth half. Returns 1.0 for
/// anything not yet aged and never reaches 0, so an old item is ranked down
/// rather than excluded — exclusion is a filter's job, not a score's.
pub fn decay(age_hours: f64, half_life_hours: f64) -> f64 {
    if age_hours <= 0.0 {
        return 1.0;
    }
    if half_life_hours <= 0.0 {
        return 0.0;
    }
    0.5_f64.powf(age_hours / half_life_hours)
}

/// Accumulates weighted signals into a score and the reasons for it.
///
/// A builder rather than one big expression so each surface adds only the
/// signals it actually has, and so a signal that is absent contributes nothing
/// instead of contributing a zero that has to be reasoned about.
#[derive(Debug)]
pub struct Scorer {
    weights: Weights,
    score: f64,
    reasons: Vec<Reason>,
}

impl Scorer {
    pub fn new(weights: Weights) -> Self {
        Self {
            weights,
            score: 0.0,
            reasons: Vec::new(),
        }
    }

    /// Add a signal measured as a count, normalised by `half`.
    pub fn count(&mut self, kind: ReasonKind, count: u32, half: f64) -> &mut Self {
        let normalized = saturate(f64::from(count), half);
        self.add(kind, count, normalized)
    }

    /// Add a signal already normalised to `[0, 1]`.
    ///
    /// `magnitude` is what the reason should say out loud, which is not always
    /// the number that was scored: category affinity scores a ratio and reports
    /// the rooms behind it.
    pub fn ratio(&mut self, kind: ReasonKind, magnitude: u32, normalized: f64) -> &mut Self {
        self.add(kind, magnitude, normalized.clamp(0.0, 1.0))
    }

    fn add(&mut self, kind: ReasonKind, magnitude: u32, normalized: f64) -> &mut Self {
        let weight = match kind {
            ReasonKind::SharedCommunity => self.weights.shared_community,
            ReasonKind::FriendActivity => self.weights.friend_activity,
            ReasonKind::MutualFriends => self.weights.mutual_friends,
            ReasonKind::CategoryAffinity => self.weights.category_affinity,
            ReasonKind::Activity => self.weights.activity,
            ReasonKind::Popularity => self.weights.popularity,
            ReasonKind::Freshness => self.weights.freshness,
        };

        let contribution = normalized * weight;
        self.score += contribution;

        if contribution > 0.0 {
            self.reasons.push(Reason {
                kind,
                magnitude,
                contribution,
                detail: kind.describe(magnitude),
            });
        }

        self
    }

    /// Finish, keeping only the reasons worth showing.
    ///
    /// `max_reasons` caps the list because the UI has room for two or three and
    /// a recommendation explained seven ways explains nothing. Trivial
    /// contributions are dropped entirely rather than ranked last: "popular
    /// right now" next to a score it barely moved is a lie the user cannot
    /// check.
    pub fn finish<T>(mut self, item: T, max_reasons: usize) -> Scored<T> {
        self.reasons
            .retain(|reason| reason.contribution >= MIN_SHOWN_CONTRIBUTION);
        self.reasons.sort_by(|a, b| {
            b.contribution
                .partial_cmp(&a.contribution)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        self.reasons.truncate(max_reasons);

        Scored {
            item,
            score: self.score,
            reasons: self.reasons,
        }
    }
}

/// Below this, a reason is noise rather than an explanation.
const MIN_SHOWN_CONTRIBUTION: f64 = 0.05;

/// Sort highest-scoring first, breaking ties deterministically.
///
/// The tie-break matters more than it looks. Scores collide constantly — every
/// item with no personal signal at all scores on popularity alone, and seeded or
/// quiet data is mostly such items. Left to an unstable sort, the same request
/// twice would return two different orders, which makes the feed jitter on every
/// refetch and makes any cursor over it meaningless.
pub fn rank<T>(scored: &mut [Scored<T>], tiebreak: impl Fn(&T) -> uuid::Uuid) {
    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| tiebreak(&a.item).cmp(&tiebreak(&b.item)))
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saturate_is_bounded_and_monotonic() {
        assert_eq!(saturate(0.0, 4.0), 0.0);
        assert_eq!(saturate(-3.0, 4.0), 0.0);
        // The documented property: `half` scores exactly a half.
        assert!((saturate(4.0, 4.0) - 0.5).abs() < 1e-9);
        assert!(saturate(1000.0, 4.0) < 1.0);
        assert!(saturate(2.0, 4.0) < saturate(3.0, 4.0));
    }

    #[test]
    fn saturate_has_diminishing_returns() {
        // The point of the curve: going from nobody to one person is worth far
        // more than going from nine to ten, which is what stops one enormous
        // room from dominating on headcount alone.
        let first = saturate(1.0, 4.0) - saturate(0.0, 4.0);
        let tenth = saturate(10.0, 4.0) - saturate(9.0, 4.0);
        assert!(first > tenth * 5.0, "first={first} tenth={tenth}");
    }

    #[test]
    fn decay_halves_at_the_half_life() {
        assert_eq!(decay(0.0, 24.0), 1.0);
        assert_eq!(decay(-5.0, 24.0), 1.0);
        assert!((decay(24.0, 24.0) - 0.5).abs() < 1e-9);
        assert!((decay(48.0, 24.0) - 0.25).abs() < 1e-9);
        assert!(decay(10_000.0, 24.0) > 0.0, "decay must not reach zero");
    }

    #[test]
    fn a_signal_that_is_absent_contributes_nothing() {
        let mut scorer = Scorer::new(Weights::default());
        scorer.count(ReasonKind::FriendActivity, 0, 3.0);
        let scored = scorer.finish((), 3);

        assert_eq!(scored.score, 0.0);
        assert!(scored.reasons.is_empty(), "zero must not be explained");
    }

    #[test]
    fn reasons_are_ordered_by_what_they_contributed() {
        let mut scorer = Scorer::new(Weights::default());
        scorer.count(ReasonKind::Popularity, 50, 10.0);
        scorer.count(ReasonKind::FriendActivity, 4, 2.0);

        let scored = scorer.finish((), 5);
        assert_eq!(scored.reasons[0].kind, ReasonKind::FriendActivity);
    }

    #[test]
    fn trivial_reasons_are_dropped_rather_than_listed_last() {
        let mut scorer = Scorer::new(Weights::default());
        scorer.count(ReasonKind::SharedCommunity, 8, 2.0);
        // Weight 0.3, and one hour into a 720-hour half-life is ~0.999 — but
        // scored against a huge `half` it lands under the threshold.
        scorer.ratio(ReasonKind::Freshness, 1, 0.01);

        let scored = scorer.finish((), 5);
        assert_eq!(scored.reasons.len(), 1);
        assert_eq!(scored.reasons[0].kind, ReasonKind::SharedCommunity);
    }

    #[test]
    fn reasons_are_capped_for_the_ui() {
        let mut scorer = Scorer::new(Weights::default());
        scorer.count(ReasonKind::SharedCommunity, 9, 2.0);
        scorer.count(ReasonKind::FriendActivity, 9, 2.0);
        scorer.count(ReasonKind::Activity, 9, 2.0);
        scorer.count(ReasonKind::Popularity, 9, 2.0);

        assert_eq!(scorer.finish((), 2).reasons.len(), 2);
    }

    #[test]
    fn an_account_with_no_signals_still_ranks_by_popularity() {
        // Cold start is the common case, not the edge case: most accounts have
        // joined nothing. It must fall out of the same scorer rather than need
        // a separate code path that can rot.
        let mut quiet = Scorer::new(Weights::default());
        quiet.count(ReasonKind::Popularity, 40, 10.0);
        let popular = quiet.finish((), 3);

        let mut obscure = Scorer::new(Weights::default());
        obscure.count(ReasonKind::Popularity, 1, 10.0);
        let unpopular = obscure.finish((), 3);

        assert!(popular.score > unpopular.score);
        assert!(popular.score > 0.0);
    }

    #[test]
    fn social_proof_outranks_raw_popularity() {
        // The policy this whole file exists to enforce: a room two of your
        // people are in beats a room that is merely busy.
        let mut social = Scorer::new(Weights::default());
        social.count(ReasonKind::SharedCommunity, 3, 2.0);
        social.count(ReasonKind::Popularity, 2, 10.0);

        let mut popular = Scorer::new(Weights::default());
        popular.count(ReasonKind::Popularity, 200, 10.0);

        assert!(
            social.finish((), 3).score > popular.finish((), 3).score,
            "a room with people you know must outrank a merely busy one"
        );
    }

    #[test]
    fn ranking_breaks_ties_deterministically() {
        let a = uuid::Uuid::from_u128(1);
        let b = uuid::Uuid::from_u128(2);

        let build = |id: uuid::Uuid| Scored {
            item: id,
            score: 1.0,
            reasons: Vec::new(),
        };

        let mut one = vec![build(b), build(a)];
        let mut two = vec![build(a), build(b)];
        rank(&mut one, |id| *id);
        rank(&mut two, |id| *id);

        assert_eq!(one[0].item, a);
        assert_eq!(two[0].item, a);
    }

    #[test]
    fn ranking_puts_the_best_first() {
        let build = |id: u128, score: f64| Scored {
            item: uuid::Uuid::from_u128(id),
            score,
            reasons: Vec::new(),
        };

        let mut items = vec![build(1, 0.2), build(2, 0.9), build(3, 0.5)];
        rank(&mut items, |id| *id);

        let scores: Vec<f64> = items.iter().map(|s| s.score).collect();
        assert_eq!(scores, vec![0.9, 0.5, 0.2]);
    }
}
