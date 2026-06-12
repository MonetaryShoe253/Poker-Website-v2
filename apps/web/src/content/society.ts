/**
 * §22 — the ONLY source of truth for real-world society details.
 * Anything genuinely unknown stays null and renders as a designed "TBA".
 */

export const SOCIETY = {
  blurb: "Join us for thrilling poker nights, epic hands, and a great community!",
  venueName: "The Diamond",
  venueAddress: "32 Leavygreave Rd, Broomhall, Sheffield S3 7RD",
  sessionTimes: "Tuesdays (tournament) & Thursdays (cash), 17:00–20:00",
  membershipUrl: "https://su.sheffield.ac.uk/activities/view/poker",
  instagramUrl: "https://www.instagram.com/pokersoc_sheffield/",
  contactEmail: null as string | null, // TBA
  committee: [
    { name: "Kiran", role: "President" },
    { name: "Milan", role: "Vice-President" },
    { name: "Kit", role: "Secretary" },
    { name: "Kat", role: "Treasurer" },
    { name: "Izzy", role: "Inclusions Officer" },
    { name: "Ethan", role: "Social Sec" },
    { name: "Callum", role: "Social Sec" },
    { name: "Mia", role: "Social Media Sec" },
    { name: "Ellie", role: "Social Media Sec" },
    { name: "Billy", role: "Tournament Sec" },
    { name: "Andy", role: "Equipment Sec" },
    { name: "Harry", role: "Sports Sec" },
  ],
} as const;
