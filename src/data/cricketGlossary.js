/**
 * Small in-repo knowledge base of cricket rules the assistant can ground
 * answers in via src/services/ragService.js, instead of relying on the
 * model's general knowledge (which can drift or hallucinate specifics) or a
 * general web search (slower, and answers the wrong scope of question).
 */
export const CRICKET_GLOSSARY = [
  {
    id: 'dls',
    text:
      'The Duckworth-Lewis-Stern (DLS) method recalculates a target score when a rain-affected ' +
      'limited-overs match is shortened, based on wickets lost and overs remaining for each side.',
  },
  {
    id: 'powerplay',
    text:
      'In One Day Internationals, the first 10 overs are the mandatory powerplay: only two fielders ' +
      'are allowed outside the 30-yard circle, encouraging aggressive batting early.',
  },
  {
    id: 'follow-on',
    text:
      'In Test cricket, if the team batting second trails by 200 runs or more after the first innings, ' +
      'the team batting first can enforce the follow-on, making the trailing team bat again immediately.',
  },
  {
    id: 'super-over',
    text:
      'A Super Over breaks a tie in a limited-overs match: each team bats one over with two wickets in ' +
      'hand, and whoever scores more wins outright.',
  },
  {
    id: 'lbw',
    text:
      'Leg Before Wicket (LBW): a batter is out if the ball would have hit the stumps but was instead ' +
      'blocked by their leg or body, subject to conditions on where it pitched and where it struck.',
  },
  {
    id: 'no-ball',
    text:
      'A no-ball is an illegal delivery (e.g. the bowler overstepping the crease) that awards the ' +
      'batting side an extra run and, in most formats, a free hit on the next delivery.',
  },
];
