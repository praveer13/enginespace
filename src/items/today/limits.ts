/*
 * Every design parameter of Today, in one place (ASSESSMENT §8; W1-T05). Each is a design target [estimated]. Nothing here was
 * measured, and a measurement would replace the number in this file and nowhere else: the page, the composer and the tests all read
 * these. The wording of ASSESSMENT §8 is "a 10-12-minute session [estimated], phone-first, ... a welcome-back set after 7 idle days
 * [estimated; kernelspace K2's rule]".
 */

/** The longest a session may run, by the nominal time of its items: the upper end of ASSESSMENT §8's 10 to 12 minutes [estimated]. */
export const SESSION_CAP_MINUTES = 12

/**
 * What one review is taken to cost, in seconds, when a session is sized [estimated]. kernelspace sized its queue at 45 s a review
 * (`NOMINAL_REVIEW_SEC` at d478f91) from a plan of 30 to 60 s an item, and numeric items here carry a scenario to read, so a little
 * more. It sizes a session and says "about 6 min left". Nothing is timed: no answer, score or schedule reads the clock.
 */
export const NOMINAL_ITEM_SECONDS = 50

/** The most reviews one session holds: 14 at the numbers above, 700 nominal seconds, which is 11.7 minutes and so inside 10 to 12 [derived]. */
export const SESSION_CAP_ITEMS = Math.floor((SESSION_CAP_MINUTES * 60) / NOMINAL_ITEM_SECONDS)

/** A gap this many local days long, since the last graded work, makes the next session a welcome-back [estimated; kernelspace K2, `GAP_DAYS`]. */
export const GAP_DAYS = 7

/** The ideas that are overdue on the day of a return, and do not fit the welcome-back set, come back over this many days [estimated; kernelspace K2, `SPREAD_DAYS`]. */
export const SPREAD_DAYS = 14

/** A "review ahead" set holds this many tickets [estimated; kernelspace's `EXTRA_SET_SIZE`]. */
export const AHEAD_ITEMS = 5

/**
 * From this stability (the days after which recall is predicted to fall to the target) an idea is served on a changed surface, at item
 * level 3, when its family offers one; before that it is served on its own, at level 2 [estimated]. Levels 0 and 1 are worked
 * examples, which are for learning and not for keeping.
 */
export const TRANSFER_STABILITY_DAYS = 21

/**
 * Rounds of the item framework's draw (`MAX_DRAWS` candidates each) that a ticket may spend before it is given up [estimated]. A family whose
 * variants assess different KCs refuses most candidates when one KC is asked for, and a second round makes a failure vanishingly rare.
 */
export const DRAW_ROUNDS = 8
