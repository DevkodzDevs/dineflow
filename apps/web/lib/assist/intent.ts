/**
 * Without a model key, Assist still makes documents and runs the health check: this reads the request for what is
 * wanted, which topics, and which period, from plain words. With a key the model decides all of this itself.
 */
export type Intent = { doc: boolean; health: boolean; all: boolean; topics: string[]; period: string };

const WORDS: [string, RegExp][] = [
  ["collections", /collection|sales|revenue|takings|income|bills?\b|payments?|cash|upi|gst collected/],
  ["expenses", /expense|spend|spent|outgoing/],
  ["payroll", /payroll|salar|pay ?slip|wages? of staff|pf\b|esi\b/],
  ["staff", /staff|team|employee|attendance|leave\b/],
  ["pantry", /pantry|stock|inventory|ingredient|purchase|store\b|\bpo\b/],
  ["rooms", /rooms?\b|stays?\b|occupancy|check.?ins?|bookings?|front ?desk/],
  ["housekeeping", /housekeep|cleaning/],
  ["menu", /menu|dish|items? sold|best.?sell/],
  ["orders", /\borders?\b|takeaway|dine.?in/],
  ["online", /online|swiggy|zomato|delivery app/],
  ["customers", /customer|regulars|loyal/],
  ["reservations", /reservation|table booking/],
  ["labour", /labou?r|daily.?wage|worker/],
  ["tables", /\btables?\b/],
  ["kitchen", /kitchen|kot\b|tickets?/],
];

export function intent(text: string): Intent {
  const t = text.toLowerCase();
  const topics = WORDS.filter(([, re]) => re.test(t)).map(([k]) => k);
  // "online orders" is the online topic, not orders as well; "table booking" is reservations, not tables
  const drop = new Set<string>([...(topics.includes("online") ? ["orders"] : []), ...(topics.includes("reservations") ? ["tables"] : [])]);
  const period =
    /\btoday|today's|todays\b/.test(t) ? "today" :
    /yesterday/.test(t) ? "yesterday" :
    /last (7|seven) days|this week|past week|weekly/.test(t) ? "last_7_days" :
    /last (30|thirty) days|past month/.test(t) ? "last_30_days" :
    /last month|previous month/.test(t) ? "last_month" :
    /financial year|this year|\bfy\b|yearly|annual/.test(t) ? "this_financial_year" : "this_month";
  return {
    doc: /\bpdf\b|document|documentation|report|statement|download|print(able)?\b/.test(t),
    health: /problem|issue|error|wrong|not working|doesn'?t work|broken|health|check (the |my )?(app|everything|system)|diagnos|\bfix\b|stuck/.test(t),
    all: /complete|everything|all (the )?details|full (business|report)|whole/.test(t),
    topics: topics.filter((k) => !drop.has(k)),
    period,
  };
}
