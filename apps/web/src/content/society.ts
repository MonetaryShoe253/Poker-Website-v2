/**
 * §22 — the ONLY source of truth for real-world society details.
 * Anything genuinely unknown stays null and renders as a designed "TBA".
 */

export const SOCIETY = {
  blurb: "Poker nights and a community worth sticking around for.",
  venueName: "The Diamond",
  venueAddress: "32 Leavygreave Rd, Broomhall, Sheffield S3 7RD",
  sessionTimes: "Tuesdays (tournament) & Thursdays (cash), 18:00–21:30",
  membershipUrl: "https://su.sheffield.ac.uk/activities/view/poker",
  instagramUrl: "https://www.instagram.com/pokersoc_sheffield/",
  contactEmail: "poksoc@sheffield.ac.uk",
  committee: [
    { name: "Kiran", role: "President" },
    { name: "Milan", role: "Vice-President" },
    { name: "Kit", role: "Secretary" },
    { name: "Kat", role: "Treasurer" },
    { name: "Billy", role: "Tournament Sec" },
    { name: "Izzy", role: "Inclusions Officer" },
    { name: "Ethan", role: "Social Sec" },
    { name: "Calum", role: "Social Sec" },
    { name: "Mia", role: "Social Media Sec" },
    { name: "Ellie", role: "Social Media Sec" },
    { name: "Andy", role: "Equipment Sec" },
    { name: "Harry", role: "Sports Sec" },
  ],
} as const;
