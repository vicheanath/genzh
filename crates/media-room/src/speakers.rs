//! Who a big room actually forwards.
//!
//! ## The arithmetic that forces this
//!
//! Audio is auto-subscribed — voice is the product — so in a room of `n`
//! everybody receives `n - 1` streams and the server writes `n × (n - 1)`
//! packets every 20 ms. That is fine at eight people (56 writes) and silly at
//! fifty (2,450 writes, 122,500 a second, for one room).
//!
//! It is also pointless. At any moment almost everyone is silent, and Opus
//! silence still costs a packet, a forwarding task's wake-up and a write. The
//! listener gains nothing from the other forty-two: a human cannot follow more
//! than a handful of simultaneous voices, and every conferencing system in
//! existence forwards a subset.
//!
//! ## The rule
//!
//! Forward the `limit` most recently active speakers, and nobody else. Anyone
//! currently speaking outranks anyone who has stopped; among those who have
//! stopped, the most recent wins. Below the limit the rule does nothing at all,
//! which is what keeps ordinary rooms exactly as they were.
//!
//! Suppression is per *published track* and costs nothing to reverse — the
//! forwarding task reads a flag — so somebody who starts talking is audible on
//! their next packet, not after a renegotiation.
//!
//! ## What this does not affect
//!
//! Voice detection runs in the publisher's pump, upstream of the fan-out, so a
//! suppressed participant is still *heard* by the server. That is what makes
//! the rule safe: the moment they speak they re-enter the active set and their
//! audio flows again. Suppressing forwarding can never suppress the signal that
//! would undo it.
//!
//! No clock of its own. The caller supplies a tick that only has to increase,
//! which is what lets the ordering be tested exactly rather than by sleeping.

use std::collections::HashMap;

use genzh_media_core::track::ParticipantId;

/// How many people a room forwards audio for at once, by default.
///
/// Comfortably more than anyone can follow, so it never bites in a real
/// conversation — it exists to bound the pathological case, not to referee an
/// ordinary meeting.
pub const DEFAULT_SPEAKER_LIMIT: usize = 12;

/// One participant's standing in the room.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Standing {
    /// Currently producing voice, per the server-side detector.
    speaking: bool,
    /// Tick of the last transition into speech. Zero for somebody who has
    /// never spoken.
    last_spoke: u64,
    /// Tick when they joined, which breaks ties among the silent.
    joined: u64,
}

/// The room's view of who is worth forwarding.
#[derive(Debug)]
pub struct ActiveSpeakers {
    limit: usize,
    standing: HashMap<ParticipantId, Standing>,
}

impl ActiveSpeakers {
    /// A set that forwards at most `limit` speakers.
    ///
    /// A limit of zero is treated as "no limit" rather than "forward nobody",
    /// which is the reading that cannot silence a room by misconfiguration.
    pub fn new(limit: usize) -> Self {
        Self {
            limit: if limit == 0 { usize::MAX } else { limit },
            standing: HashMap::new(),
        }
    }

    /// Start tracking somebody who has just joined.
    pub fn insert(&mut self, participant: ParticipantId, tick: u64) {
        self.standing.entry(participant).or_insert(Standing {
            speaking: false,
            last_spoke: 0,
            joined: tick,
        });
    }

    /// Stop tracking somebody who has left.
    pub fn remove(&mut self, participant: ParticipantId) {
        self.standing.remove(&participant);
    }

    /// Record a voice-activity transition.
    pub fn set_speaking(&mut self, participant: ParticipantId, speaking: bool, tick: u64) {
        let entry = self.standing.entry(participant).or_insert(Standing {
            speaking: false,
            last_spoke: 0,
            joined: tick,
        });

        entry.speaking = speaking;
        if speaking {
            entry.last_spoke = tick;
        }
    }

    /// Is this participant's audio worth forwarding right now?
    pub fn is_active(&self, participant: ParticipantId) -> bool {
        // Below the limit the rule is inert, and — importantly — somebody the
        // set has never heard of is forwarded rather than silently dropped.
        if self.standing.len() <= self.limit {
            return true;
        }
        self.active().contains(&participant)
    }

    /// The participants to forward, best first.
    ///
    /// Ordered by: speaking now, then most recently spoken, then who joined
    /// first. The last of those exists so the answer is deterministic in a room
    /// where nobody has said anything yet, rather than depending on hash order.
    pub fn active(&self) -> Vec<ParticipantId> {
        let mut ranked: Vec<(ParticipantId, Standing)> =
            self.standing.iter().map(|(id, s)| (*id, *s)).collect();

        ranked.sort_by(|(a_id, a), (b_id, b)| {
            b.speaking
                .cmp(&a.speaking)
                .then(b.last_spoke.cmp(&a.last_spoke))
                .then(a.joined.cmp(&b.joined))
                .then(a_id.cmp(b_id))
        });

        ranked
            .into_iter()
            .take(self.limit)
            .map(|(id, _)| id)
            .collect()
    }

    /// How many participants are being tracked.
    pub fn len(&self) -> usize {
        self.standing.len()
    }

    pub fn is_empty(&self) -> bool {
        self.standing.is_empty()
    }
}

impl Default for ActiveSpeakers {
    fn default() -> Self {
        Self::new(DEFAULT_SPEAKER_LIMIT)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn people(n: usize) -> Vec<ParticipantId> {
        (0..n).map(|_| ParticipantId::new()).collect()
    }

    #[test]
    fn a_small_room_forwards_everybody() {
        let mut speakers = ActiveSpeakers::new(12);
        let room = people(8);
        for (tick, id) in room.iter().enumerate() {
            speakers.insert(*id, tick as u64);
        }

        for id in &room {
            assert!(speakers.is_active(*id), "nobody is suppressed under the limit");
        }
    }

    #[test]
    fn somebody_the_set_has_never_seen_is_forwarded() {
        // The failure mode worth designing against: a track whose participant
        // was never registered must not be silently dropped.
        let speakers = ActiveSpeakers::new(2);
        assert!(speakers.is_active(ParticipantId::new()));
    }

    #[test]
    fn a_large_room_forwards_only_the_limit() {
        let mut speakers = ActiveSpeakers::new(3);
        let room = people(10);
        for (tick, id) in room.iter().enumerate() {
            speakers.insert(*id, tick as u64);
        }

        assert_eq!(speakers.active().len(), 3);
        let suppressed = room.iter().filter(|id| !speakers.is_active(**id)).count();
        assert_eq!(suppressed, 7);
    }

    #[test]
    fn whoever_is_speaking_outranks_whoever_is_not() {
        let mut speakers = ActiveSpeakers::new(2);
        let room = people(5);
        for (tick, id) in room.iter().enumerate() {
            speakers.insert(*id, tick as u64);
        }

        // The last two to join would otherwise be last in the ranking.
        speakers.set_speaking(room[3], true, 100);
        speakers.set_speaking(room[4], true, 101);

        assert!(speakers.is_active(room[3]));
        assert!(speakers.is_active(room[4]));
        assert!(!speakers.is_active(room[0]));
    }

    #[test]
    fn somebody_who_starts_talking_displaces_the_stalest_voice() {
        let mut speakers = ActiveSpeakers::new(2);
        let room = people(3);
        for (tick, id) in room.iter().enumerate() {
            speakers.insert(*id, tick as u64);
        }

        speakers.set_speaking(room[0], true, 10);
        speakers.set_speaking(room[1], true, 20);
        speakers.set_speaking(room[0], false, 30);
        speakers.set_speaking(room[1], false, 40);
        assert!(speakers.is_active(room[0]) && speakers.is_active(room[1]));

        // The third person speaks for the first time.
        speakers.set_speaking(room[2], true, 50);

        assert!(speakers.is_active(room[2]), "a live voice is always forwarded");
        assert!(speakers.is_active(room[1]), "and the more recent of the two");
        assert!(!speakers.is_active(room[0]), "the stalest one gives way");
    }

    #[test]
    fn falling_silent_does_not_immediately_cut_somebody_off() {
        // The gap between sentences must not toggle forwarding, or a
        // conversation turns into a stutter.
        let mut speakers = ActiveSpeakers::new(1);
        let room = people(3);
        for (tick, id) in room.iter().enumerate() {
            speakers.insert(*id, tick as u64);
        }

        speakers.set_speaking(room[2], true, 10);
        speakers.set_speaking(room[2], false, 20);

        assert!(
            speakers.is_active(room[2]),
            "the most recent speaker keeps the slot until somebody takes it"
        );
    }

    #[test]
    fn leaving_frees_a_slot() {
        let mut speakers = ActiveSpeakers::new(2);
        let room = people(3);
        for (tick, id) in room.iter().enumerate() {
            speakers.insert(*id, tick as u64);
        }
        assert!(!speakers.is_active(room[2]));

        speakers.remove(room[0]);

        assert_eq!(speakers.len(), 2);
        assert!(speakers.is_active(room[2]), "under the limit again");
    }

    #[test]
    fn the_ranking_is_deterministic_in_a_silent_room() {
        let room = people(6);

        let rank = || {
            let mut speakers = ActiveSpeakers::new(3);
            for (tick, id) in room.iter().enumerate() {
                speakers.insert(*id, tick as u64);
            }
            speakers.active()
        };

        assert_eq!(rank(), rank(), "hash order must not leak into the answer");
        assert_eq!(rank(), room[..3].to_vec(), "earliest joiners win the tie");
    }

    #[test]
    fn a_zero_limit_means_no_limit() {
        let mut speakers = ActiveSpeakers::new(0);
        let room = people(50);
        for (tick, id) in room.iter().enumerate() {
            speakers.insert(*id, tick as u64);
        }

        assert!(room.iter().all(|id| speakers.is_active(*id)));
    }
}
